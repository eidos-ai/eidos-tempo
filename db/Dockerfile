FROM postgres:17-bookworm

ARG WALG_VERSION=v3.0.9
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl jq \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=amd64; sum=4f03ee4679db7f660bfd1b2b8291ac5df247cd2ec48074b60c112f4897299f24 ;; \
      arm64) arch=aarch64; sum=20191a37ad091a880c25f4cc907e6f0deb7f12bdd8a53fd62dbc7fcbf2eac712 ;; \
    esac; \
    curl -fsSL -o /tmp/wal-g.tar.gz \
      "https://github.com/wal-g/wal-g/releases/download/$WALG_VERSION/wal-g-pg-22.04-$arch.tar.gz"; \
    echo "$sum  /tmp/wal-g.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/wal-g.tar.gz -C /tmp; \
    mv "/tmp/wal-g-pg-22.04-$arch" /usr/local/bin/wal-g; \
    rm /tmp/wal-g.tar.gz

ENV PGDATA=/var/lib/postgresql/data/pgdata
COPY pg_hba.conf pg_hba_tcp.conf /etc/tempo/
COPY tempo-db.sh /usr/local/bin/tempo-db
ENTRYPOINT ["tempo-db"]
CMD ["run"]
