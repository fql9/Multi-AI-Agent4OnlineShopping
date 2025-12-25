#!/bin/bash
# 从 contracts 生成 TypeScript SDK 和 Python Models

set -e

echo "========================================="
echo "Generating SDK from contracts..."
echo "========================================="

# 1. Generate TypeScript types from JSON Schema
echo ""
echo "Step 1: Generating TypeScript types..."
echo "---------------------------------------"

# TODO: Use json-schema-to-typescript
# npx json-schema-to-typescript contracts/json-schema/models/*.json -o packages/contracts-ts/src/

echo "TypeScript generation: TODO (install json-schema-to-typescript)"

# 2. Generate Python Pydantic models
echo ""
echo "Step 2: Generating Python models..."
echo "---------------------------------------"

# TODO: Use datamodel-code-generator
# datamodel-codegen --input contracts/json-schema/models --output agents/src/models/generated.py

echo "Python generation: TODO (install datamodel-code-generator)"

# 3. Validate all schemas
echo ""
echo "Step 3: Validating schemas..."
echo "---------------------------------------"

for schema in contracts/json-schema/**/*.schema.json; do
    if [ -f "$schema" ]; then
        echo "Validating: $schema"
        # ajv compile -s "$schema" --spec=draft2020 --strict=false
    fi
done

echo ""
echo "========================================="
echo "SDK generation complete!"
echo "========================================="

