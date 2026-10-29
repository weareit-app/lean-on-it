"""F1 spike, NON-PRODUCTION. Writes one export per case into build/cases/.

Cases elaborated from Lean sources are copied from build/exports/. The others are handcrafted
by editing those exports. Run with `python3 -I scripts/mkcases.py` after build-fixtures.sh.
"""

import json
import os
import sys

F1 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS = os.path.join(F1, "build", "exports")
CASES = os.path.join(F1, "build", "cases")

# case id -> (expected, source export, description)
SOURCE_CASES = {
    "01-honest": ("accepted", "F1Sub.Honest", "honest tactic proof"),
    "02-honest-helper": ("accepted", "F1Sub.Helper", "honest proof via a helper lemma"),
    "03-honest-inductive": ("accepted", "F1Sub.WithInductive", "honest proof with a new inductive"),
    "10-redef-dependency": ("a", "F1Forged.RedefDep", "export brings its own Relation.Comp"),
    "11-redef-obligation": ("a", "F1Forged.RedefObligation", "export redefines the obligation"),
    "20-outside-namespace": ("b", "F1Sub.OutsideNs", "helper lemma outside the reserved namespace"),
    "30-weaker-universe": ("c", "F1Sub.WeakerUniverse", "obligation at universes 0 only"),
    "31-weaker-statement": ("c", "F1Sub.WeakerStatement", "one direction of the iff"),
    "40-declared-axiom": ("d", "F1Sub.DeclaredAxiom", "proof via an axiom in the export"),
    "41-sorry": ("d", "F1Sub.Sorry", "proof via sorryAx"),
    "42-native-decide": ("d", "F1Sub.NativeDecide", "native_decide (aux axiom in Lean 4.35.0)"),
}


def read(mod):
    with open(os.path.join(EXPORTS, mod + ".ndjson"), encoding="utf-8") as f:
        return f.read().splitlines()


def write(case, lines=None, raw=None):
    path = os.path.join(CASES, case + ".ndjson")
    with open(path, "wb") as f:
        if raw is not None:
            f.write(raw)
        else:
            f.write(("\n".join(lines) + "\n").encode("utf-8"))


def name_table(lines):
    """name index -> tuple of components, from the export's "in" lines."""
    names = {0: ()}
    for line in lines:
        o = json.loads(line)
        if "in" in o:
            if "str" in o:
                names[o["in"]] = names[o["str"]["pre"]] + (o["str"]["str"],)
            else:
                names[o["in"]] = names[o["num"]["pre"]] + (o["num"]["i"],)
    return names


def idx_of(lines, comps):
    for i, c in name_table(lines).items():
        if c == tuple(comps):
            return i
    raise KeyError(comps)


def line_of(lines, key, idx):
    for n, line in enumerate(lines):
        o = json.loads(line)
        if o.get(key) == idx:
            return n
    raise KeyError((key, idx))


def rename(lines, old, new):
    """Point the name index of `old` at `new`. Every reference to `old` (and to names under it)
    follows. New prefix components get fresh name lines just before `old`'s line."""
    lines = list(lines)
    names = name_table(lines)
    old_idx = idx_of(lines, old)
    at = line_of(lines, "in", old_idx)
    rev = {v: k for k, v in names.items()}
    nxt = max(names) + 1
    pre = 0
    for k in range(1, len(new)):
        comps = tuple(new[:k])
        if comps not in rev:
            c = comps[-1]
            body = {"num": {"pre": pre, "i": c}} if isinstance(c, int) else {"str": {"pre": pre, "str": c}}
            lines.insert(at, json.dumps({"in": nxt, **body}, separators=(",", ":")))
            at += 1
            rev[comps] = nxt
            nxt += 1
        pre = rev[comps]
    last = new[-1]
    body = {"num": {"pre": pre, "i": last}} if isinstance(last, int) else {"str": {"pre": pre, "str": last}}
    lines[at] = json.dumps({"in": old_idx, **body}, separators=(",", ":"))
    return lines


def edit_last_thm(lines, **fields):
    lines = list(lines)
    o = json.loads(lines[-1])
    o["thm"].update(fields)
    lines[-1] = json.dumps(o, separators=(",", ":"))
    return lines


def max_idx(lines, key):
    return max(json.loads(line).get(key, -1) for line in lines)


def main():
    os.makedirs(CASES, exist_ok=True)
    expected = {}
    for case, (exp, mod, desc) in SOURCE_CASES.items():
        write(case, read(mod))
        expected[case] = (exp, desc)

    honest, helper, ind = read("F1Sub.Honest"), read("F1Sub.Helper"), read("F1Sub.WithInductive")
    sub = ["LeanOnIt", "Submission"]

    # The decision must not depend on the export's copies of trusted constants: drop them all.
    names = name_table(honest)
    decl_keys = ("def", "thm", "axiom", "opaque", "quot")
    def is_new(o):
        if "inductive" in o:
            return all(names[t["name"]][:2] == tuple(sub) for t in o["inductive"]["types"])
        k = next(k for k in decl_keys if k in o)
        return names[o[k]["name"]][:2] == tuple(sub)
    stripped = [line for line in honest
                if not any(k in json.loads(line) for k in decl_keys + ("inductive",)) or is_new(json.loads(line))]
    write("04-honest-new-only", stripped)
    expected["04-honest-new-only"] = ("accepted", "honest export with every trusted-named constant removed")

    # (a)/(b) name collisions, by renaming the honest helper lemma.
    write("12-collide-trusted", rename(helper, sub + ["helper"], ["Relation", "fun_eq_comp"]))
    expected["12-collide-trusted"] = ("a", "helper renamed to the trusted Relation.fun_eq_comp")
    write("13-collide-trusted-private",
          rename(helper, sub + ["helper"], ["_private", "Init", "Prelude", 0, "Nat", "zero_le", "match_1_1"]))
    expected["13-collide-trusted-private"] = ("a", "helper renamed to a trusted private name")
    write("21-collide-private-user",
          rename(helper, sub + ["helper"], ["_private", "LeanOnIt", "Fake", 0, "Relation", "fun_eq_comp"]))
    expected["21-collide-private-user"] = ("b", "new private name whose user name is a trusted name")
    write("22-reserved-root", rename(helper, sub + ["helper"], sub))
    expected["22-reserved-root"] = ("b", "helper renamed to the reserved namespace itself")

    # (d) via Lean.ofReduceBool, and an axiom forged under a permitted axiom's name.
    nd = read("F1Sub.NativeDecide")
    ax = ["LeanOnIt", "Submission", "proof", "_native", "native_decide", "ax_1_1"]
    write("43-ofReduceBool", rename(nd, ax, ["Lean", "ofReduceBool"]))
    expected["43-ofReduceBool"] = ("b,d", "native_decide's axiom renamed to Lean.ofReduceBool")
    write("44-axiom-named-propext", rename(read("F1Sub.DeclaredAxiom"), sub + ["cheat"], ["propext"]))
    expected["44-axiom-named-propext"] = ("a", "declared axiom renamed to the permitted propext")

    # (e) kernel-invalid terms that pass (a)-(d).
    t = json.loads(honest[-1])["thm"]
    write("50-kernel-value-is-type", edit_last_thm(honest, value=t["type"]))
    expected["50-kernel-value-is-type"] = ("e", "theorem value replaced by its own type")
    h = list(helper)
    helper_idx = idx_of(h, sub + ["helper"])
    for n, line in enumerate(h):
        o = json.loads(line)
        if o.get("const", {}).get("name") == helper_idx:
            o["const"]["us"] = o["const"]["us"][:-1]
            h[n] = json.dumps(o, separators=(",", ":"))
    write("51-kernel-universe-arity", h)
    expected["51-kernel-universe-arity"] = ("e", "reference to helper with one universe too few")

    # (s) structure: a new constructor claiming a trusted inductive.
    i2 = list(ind)
    iff = idx_of(i2, ["Iff"])
    for n, line in enumerate(i2):
        o = json.loads(line)
        if "inductive" in o:
            for c in o["inductive"]["ctors"]:
                if name_table(i2)[c["name"]] == tuple(sub + ["Wit", "mk"]):
                    c["induct"] = iff
                    i2[n] = json.dumps(o, separators=(",", ":"))
    write("52-ctor-claims-trusted", i2)
    expected["52-ctor-claims-trusted"] = ("s", "new constructor's induct field points at Iff")

    # (s) too many new declarations: 300 extra defs `x_k : Sort 1 := Sort 0`.
    many = list(honest[:-1])
    nn, ll, ee = max_idx(honest, "in") + 1, max_idx(honest, "il") + 1, max_idx(honest, "ie") + 1
    many += [json.dumps({"il": ll, "succ": 0}), json.dumps({"ie": ee, "sort": ll}),
             json.dumps({"ie": ee + 1, "sort": 0})]
    sub_idx = idx_of(honest, sub)
    for k in range(300):
        many.append(json.dumps({"in": nn + k, "str": {"pre": sub_idx, "str": f"x{k}"}}))
        many.append(json.dumps({"def": {"name": nn + k, "levelParams": [], "type": ee, "value": ee + 1,
                                        "hints": "abbrev", "safety": "safe", "all": [nn + k]}}))
    many.append(honest[-1])
    write("53-too-many-new", many)
    expected["53-too-many-new"] = ("s", "300 extra new declarations, over the 256 limit")

    # Decoder: truncated, malformed, oversized, structure bombs.
    raw = ("\n".join(honest) + "\n").encode("utf-8")
    write("60-truncated-mid-line", raw=raw[: len(raw) // 2])
    write("61-truncated-line-boundary", honest[:-1])
    write("62-empty", raw=b"")
    write("63-header-missing", honest[1:])
    hdr = json.loads(honest[0])
    hdr["meta"]["format"]["version"] = "3.0.0"
    write("64-wrong-format-version", [json.dumps(hdr)] + honest[1:])
    hdr = json.loads(honest[0])
    hdr["meta"]["lean"]["version"] = "4.34.0"
    write("65-wrong-lean-version", [json.dumps(hdr)] + honest[1:])
    mid = len(honest) // 2
    write("66-invalid-json", honest[:mid] + ['{"in":99999,"str":'] + honest[mid:])
    write("67-unknown-object", honest[:mid] + ['{"foo":1}'] + honest[mid:])
    write("68-undefined-index", edit_last_thm(honest, value=10**6))
    ie_line = next(line for line in honest if '"ie"' in line)
    write("69-duplicate-index", honest[:mid] + [ie_line] + honest[mid:])
    write("70-duplicate-declaration", honest + [honest[-1]])
    write("71-wrong-field-type", [*honest[:-1], honest[-1].replace(f'"value":{t["value"]}', f'"value":"{t["value"]}"')])
    write("72-non-utf8", raw=raw[:100] + b"\xff\xfe" + raw[100:])
    write("73-nested-json", honest[:mid] + ["[" * 100000 + "]" * 100000] + honest[mid:])
    write("73b-nested-json-short", honest[:mid] + ["[" * 30000 + "]" * 30000] + honest[mid:])
    write("74-long-line", honest[:mid] + [json.dumps({"in": 99999, "str": {"pre": 0, "str": "a" * 70000}})]
          + honest[mid:])
    pad, k = [], 0
    while len(raw) + sum(len(p) + 1 for p in pad) < 9 * 1024 * 1024:
        pad.append(json.dumps({"in": 100000 + k, "str": {"pre": 0, "str": f"pad{k:08d}" + "p" * 64}}))
        k += 1
    write("75-oversized", honest[:-1] + pad + [honest[-1]])
    chain, base = [], max_idx(honest, "ie") + 1
    chain.append(json.dumps({"ie": base, "sort": 0}))
    for d in range(1, 5000):
        chain.append(json.dumps({"ie": base + d, "app": {"fn": base + d - 1, "arg": base}}))
    write("76-expr-depth-bomb", honest[:-1] + chain + [honest[-1]])
    lv, lbase = [], max_idx(honest, "il") + 1
    lv.append(json.dumps({"il": lbase, "succ": 0}))
    for d in range(1, 300):
        lv.append(json.dumps({"il": lbase + d, "succ": lbase + d - 1}))
    write("77-level-depth-bomb", honest[:-1] + lv + [honest[-1]])
    nm, nbase = [], max_idx(honest, "in") + 1
    nm.append(json.dumps({"in": nbase, "str": {"pre": 0, "str": "n"}}))
    for d in range(1, 200):
        nm.append(json.dumps({"in": nbase + d, "str": {"pre": nbase + d - 1, "str": "n"}}))
    write("78-name-depth-bomb", honest[:-1] + nm + [honest[-1]])
    # Under every limit: a 4000-deep DAG whose tree is 2^4000 nodes, as the theorem's value.
    dag = [json.dumps({"ie": base, "sort": 0})]
    for d in range(1, 4000):
        dag.append(json.dumps({"ie": base + d, "app": {"fn": base + d - 1, "arg": base + d - 1}}))
    write("79-dag-blowup", honest[:-1] + dag + [edit_last_thm(honest, value=base + 3999)[-1]])
    for case, desc in [
        ("60-truncated-mid-line", "first half of the honest export's bytes"),
        ("61-truncated-line-boundary", "honest export without its last line"),
        ("62-empty", "empty file"),
        ("63-header-missing", "no metadata line"),
        ("64-wrong-format-version", "format 3.0.0"),
        ("65-wrong-lean-version", "Lean 4.34.0 in the header"),
        ("66-invalid-json", "a broken JSON line"),
        ("67-unknown-object", "an unknown object kind"),
        ("68-undefined-index", "theorem value refers to an undefined expression"),
        ("69-duplicate-index", "an expression index bound twice"),
        ("70-duplicate-declaration", "the theorem declared twice"),
        ("71-wrong-field-type", "a string where an index is expected"),
        ("72-non-utf8", "invalid UTF-8 bytes"),
        ("73-nested-json", "one line nested 100000 deep"),
        ("73b-nested-json-short", "one line nested 30000 deep, within the line limit"),
        ("74-long-line", "one 70 KB line"),
        ("75-oversized", "9 MiB export, over the 8 MiB limit"),
        ("76-expr-depth-bomb", "expression chain 5000 deep"),
        ("77-level-depth-bomb", "universe level chain 300 deep"),
        ("78-name-depth-bomb", "name chain 200 deep"),
    ]:
        expected[case] = ("decoder", desc)
    expected["79-dag-blowup"] = ("e", "4000-deep shared DAG as the theorem's value, within every limit")

    with open(os.path.join(CASES, "expected.json"), "w", encoding="utf-8") as f:
        json.dump({k: {"expected": v[0], "description": v[1]} for k, v in sorted(expected.items())}, f, indent=1)
    print(f"wrote {len(expected)} cases to {CASES}", file=sys.stderr)


if __name__ == "__main__":
    main()
