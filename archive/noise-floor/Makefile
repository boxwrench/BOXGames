# BOXGames — a monorepo of game demos built on the Kaiju Engine.
#
# Everything here delegates to scripts/ so the same commands work in CI and by
# hand. Start with `make bootstrap`.

GAME ?= noise-floor

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "};{printf "  \033[1m%-18s\033[0m %s\n",$$1,$$2}'
	@echo
	@echo "  Set GAME=<name> to target a specific demo (default: $(GAME))"
	@echo "  Available: $$(ls games 2>/dev/null | tr '\n' ' ')"

.PHONY: bootstrap
bootstrap: ## Install toolchain, fetch pinned engine, sync stock content
	@scripts/bootstrap.sh

.PHONY: build
build: content ## Build GAME (rebuilds its content database first)
	@scripts/build.sh $(GAME)

.PHONY: content
content: ## Rebuild GAME's flat content database from its assets
	@scripts/build-content.sh $(GAME)

.PHONY: run
run: ## Build and run GAME
	@scripts/run.sh $(GAME)

.PHONY: test
test: ## Run all Go tests across the workspace
	@. scripts/env.sh && go test ./shared/... $$(ls -d games/*/ | sed 's|$$|...|;s|^|./|')

.PHONY: vet
vet: ## Vet all workspace packages
	@. scripts/env.sh && go vet ./shared/... $$(ls -d games/*/ | sed 's|$$|...|;s|^|./|')

.PHONY: fmt
fmt: ## Format all Go code
	@. scripts/env.sh && gofmt -l -w shared games tools

.PHONY: sync-content
sync-content: ## Re-sync engine stock content (flat database)
	@scripts/sync-stock-content.sh

.PHONY: clean
clean: ## Remove build output (keeps toolchain and engine checkout)
	@rm -rf games/*/bin games/*/content
	@echo "Removed build output and generated content"
