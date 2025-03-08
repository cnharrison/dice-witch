#!/bin/bash

CERTS_DIR="./certs"
mkdir -p $CERTS_DIR

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout $CERTS_DIR/localhost-key.pem \
  -out $CERTS_DIR/localhost.pem \
  -subj "/C=US/ST=State/L=City/O=Dice Witch/CN=localhost" \
  -addext "subjectAltName = DNS:localhost, IP:127.0.0.1"

chmod 600 $CERTS_DIR/localhost-key.pem
chmod 600 $CERTS_DIR/localhost.pem

echo "Self-signed certificates generated successfully in $CERTS_DIR directory."
echo "Run the server with USE_SSL=true to enable HTTPS with these certificates:"
echo "USE_SSL=true bun run server.ts"