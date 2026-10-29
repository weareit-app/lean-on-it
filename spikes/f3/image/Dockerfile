# Spike F3 (non-production). The Lean toolchain, Mathlib's build outputs and a
# small Mathlib-importing module. Built with network on the runner host; run
# read-only under runsc with no network.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# apt packages are not pinned; they are build-stage tools only. Their versions
# are printed in the build log.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git zstd \
 && rm -rf /var/lib/apt/lists/* \
 && dpkg-query -W ca-certificates curl git zstd

ARG LEAN_VERSION=4.35.0
ARG LEAN_SHA256=7289597a44543246c9227b8cae501767e095ce17f6d448b95fc4a8dc97268f6d
RUN curl -fsSL --retry 3 -o /tmp/lean.tar.zst \
      "https://github.com/leanprover/lean4/releases/download/v${LEAN_VERSION}/lean-${LEAN_VERSION}-linux.tar.zst" \
 && echo "${LEAN_SHA256}  /tmp/lean.tar.zst" | sha256sum -c - \
 && mkdir /opt/lean \
 && tar --zstd -xf /tmp/lean.tar.zst -C /opt/lean --strip-components=1 \
 && rm /tmp/lean.tar.zst
ENV PATH=/opt/lean/bin:$PATH

WORKDIR /opt/work
COPY lakefile.toml lean-toolchain Workload.lean ./
# Mathlib at the v4.35.0 tag's commit; its manifest pins the other packages.
# The cache is Mathlib's prebuilt .olean files.
RUN lake update \
 && cat lake-manifest.json \
 && lake exe cache get \
 && lake build \
 && lake env printenv LEAN_PATH > /opt/leanpath \
 && rm -rf /root/.cache \
 && find /opt/work/.lake -name '*.olean' | wc -l \
 && du -sh /opt/lean /opt/work/.lake

USER 65534:65534
