#!/bin/bash

echo "=== Acadex Security & Code Quality Scan ==="
echo

# 1. Check for common vulnerabilities
echo "🔍 Checking for vulnerabilities..."
npm audit --audit-level=moderate

echo
echo "📦 Package Updates Check..."
npm outdated

echo
echo "🔍 ESLint Code Quality Check..."
# Create a simple eslint check script
cat > eslint-check.js << 'EOF'
const { ESLint } = require('eslint');
const fs = require('fs');
const path = require('path');

async function lintProject() {
  const eslint = new ESLint({
    baseConfig: {
      env: {
        node: true,
        es2021: true
      },
      extends: ['eslint:recommended'],
      parserOptions: {
        ecmaVersion: 12,
        sourceType: 'commonjs'
      },
      rules: {
        'no-unused-vars': 'warn',
        'no-console': 'off',
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'indent': ['error', 2],
        'no-trailing-spaces': 'error',
        'eol-last': 'error',
        'comma-dangle': ['error', 'never'],
        'no-multiple-empty-lines': ['error', { 'max': 2 }],
        'object-curly-spacing': ['error', 'always'],
        'array-bracket-spacing': ['error', 'never'],
        'space-before-function-paren': ['error', 'never'],
        'keyword-spacing': 'error',
        'space-infix-ops': 'error',
        'no-var': 'error',
        'prefer-const': 'error',
        'prefer-arrow-callback': 'error',
        'no-undef': 'error',
        'no-redeclare': 'error'
      }
    }
  });

  const results = await ESLint.lintFiles(['**/*.js'], { baseConfig: eslint.config });
  
  let errorCount = 0;
  let warningCount = 0;
  
  results.forEach(result => {
    result.messages.forEach(message => {
      if (message.severity === 2) {
        errorCount++;
        console.log(`❌ ERROR: ${message.message} (${message.ruleId})`);
        console.log(`   at ${message.line}:${message.column} in ${result.filePath}`);
      } else if (message.severity === 1) {
        warningCount++;
        console.log(`⚠️  WARNING: ${message.message} (${message.ruleId})`);
        console.log(`   at ${message.line}:${message.column} in ${result.filePath}`);
      }
    });
  });
  
  console.log(`\n📊 ESLint Results:`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Warnings: ${warningCount}`);
  console.log(`   Files checked: ${results.length}`);
  
  return { errorCount, warningCount };
}

lintProject().then(({ errorCount, warningCount }) => {
  if (errorCount > 0) {
    console.log('\n❌ Code quality issues found. Please fix errors before deployment.');
    process.exit(1);
  } else if (warningCount > 0) {
    console.log('\n⚠️  Warnings found. Consider fixing for better code quality.');
  } else {
    console.log('\n✅ Code quality check passed!');
  }
});
EOF

node eslint-check.js
rm eslint-check.js

echo
echo "🔒 Security Best Practices Check..."

# Check for hardcoded secrets
echo "Checking for hardcoded secrets..."
if grep -r "password\|secret\|key\|token" --include="*.js" --include="*.json" --exclude-dir=node_modules . > /dev/null 2>&1; then
    echo "⚠️  Potential hardcoded secrets found:"
    grep -r "password\|secret\|key\|token" --include="*.js" --include="*.json" --exclude-dir=node_modules . | head -5
else
    echo "✅ No obvious hardcoded secrets found"
fi

echo
echo "🔍 Environment Variables Check..."
if [ ! -f .env ]; then
    echo "⚠️  .env file not found"
else
    echo "✅ .env file exists"
    
    # Check for required variables
    required_vars=("MONGODB_URI" "SESSION_SECRET" "PORT")
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" .env; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        echo "⚠️  Missing environment variables: ${missing_vars[*]}"
    else
        echo "✅ Required environment variables present"
    fi
fi

echo
echo "📁 File Permissions Check..."
# Check for sensitive file permissions
sensitive_files=(".env" "package.json" "server.js")
for file in "${sensitive_files[@]}"; do
    if [ -f "$file" ]; then
        permissions=$(stat -c "%a" "$file")
        if [ "$permissions" = "600" ] || [ "$permissions" = "644" ]; then
            echo "✅ $file has appropriate permissions"
        else
            echo "⚠️  $file has unusual permissions: $permissions"
        fi
    fi
done

echo
echo "🔍 Dependencies Check..."
# Check for deprecated packages
echo "Checking for deprecated packages..."
npm ls --depth=0 | grep -i "deprecated" || echo "✅ No deprecated packages found"

echo
echo "📊 Summary:"
echo "   - Vulnerability scan completed"
echo "   - Code quality check completed"
echo "   - Security best practices reviewed"
echo "   - Dependencies verified"
echo
echo "🎯 Recommendations:"
echo "   1. Fix any ESLint errors before production deployment"
echo "   2. Update vulnerable packages with 'npm audit fix'"
echo "   3. Use environment variables for all secrets"
echo "   4. Regularly update dependencies"
echo "   5. Implement proper error handling and logging"
