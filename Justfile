# Justfile Template - Power User Commands
#
# This Justfile provides a convenient way to run common development tasks.
# It abstracts away the underlying commands for different tech stacks.
# Uncomment and customize the sections relevant to your project.
#
# To use:
# 1. Install Just: curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash
# 2. Run commands like: just setup, just test, just lint, just format

# --- Variables (Customize these for your project) ---
# PYTHON_VENV := .venv
# NODE_ENV_CMD := npm
# GO_MODULE := ./...

# --- Core Recipes ---

@setup:
    # Set up development environment (install dependencies, etc.)
    echo "Running setup..."
    # Python example:
    # python -m venv {{PYTHON_VENV}}
    # source {{PYTHON_VENV}}/bin/activate
    # pip install -r requirements.txt
    #
    # Node.js example:
    # {{NODE_ENV_CMD}} install
    #
    # Go example:
    # go mod download
    echo "Setup complete."

@test:
    # Run tests for the project
    echo "Running tests..."
    # Python example:
    # source {{PYTHON_VENV}}/bin/activate
    # pytest
    #
    # Node.js example:
    # {{NODE_ENV_CMD}} test
    #
    # Go example:
    # go test {{GO_MODULE}}
    echo "Tests complete."

@lint:
    # Run linter/static analysis for the project
    echo "Running linter..."
    # Python example:
    # source {{PYTHON_VENV}}/bin/activate
    # ruff check .
    #
    # Node.js example:
    # {{NODE_ENV_CMD}} run lint
    #
    # Go example:
    # go vet {{GO_MODULE}}
    echo "Linting complete."

@format:
    # Run code formatter for the project
    echo "Running formatter..."
    # Python example:
    # source {{PYTHON_VENV}}/bin/activate
    # black .
    #
    # Node.js example:
    # {{NODE_ENV_CMD}} run format
    #
    # Go example:
    # go fmt {{GO_MODULE}}
    echo "Formatting complete."

@clean:
    # Clean up build artifacts, cache, etc.
    echo "Cleaning project..."
    # Python example:
    # rm -rf __pycache__ {{PYTHON_VENV}}
    #
    # Node.js example:
    # rm -rf node_modules build dist
    #
    # Go example:
    # go clean
    echo "Clean complete."

@help:
    @just --list
    echo "Use 'just <recipe>' to run a command. E.g., 'just setup'"

# --- Default recipe (runs when 'just' is called without arguments) ---
default: help
