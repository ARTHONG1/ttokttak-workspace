# Hangul AI Workbench — web edition (Cloud Run)
FROM rust:1-bookworm AS sidecar
WORKDIR /src
COPY app/apps/sheets/native/xlsx-engine/ ./
RUN cargo build --release --locked

FROM node:24-bookworm-slim
# chromium prints the editors' print pages to PDF and LibreOffice turns Word, Excel and
# PowerPoint documents into PDFs (똑딱서명 and the PDF exports; server-pdf.cjs)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-noto-cjk fonts-nanum fontconfig \
    chromium libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /srv/program
COPY app/package.json ./
COPY app/vendor ./vendor
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY app/ ./
COPY --from=sidecar /src/target/release/xlsx-sidecar ./apps/sheets/native/xlsx-engine/target/release/xlsx-sidecar
ENV PORT=8080 WEB_APP_ROOT=/srv/program WEB_SESSIONS_ROOT=/tmp/hs \
  WEB_PDF_CHROMIUM=/usr/bin/chromium WEB_SOFFICE=/usr/bin/soffice
EXPOSE 8080
CMD ["node", "web/runtime/gateway.mjs"]

