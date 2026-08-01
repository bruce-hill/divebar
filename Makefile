PREFIX ?= /usr/local
BINDIR := $(DESTDIR)$(PREFIX)/bin

TARGET_DIR := $(or $(CARGO_TARGET_DIR),$(CURDIR)/src-tauri/target)
BIN := $(TARGET_DIR)/release/divebar

.PHONY: build run install uninstall clean

build:
	cd src-tauri && cargo build --release
	@mkdir -p dist
	@cp -f "$(BIN)" dist/divebar

run:
	cd src-tauri && cargo run

# No build dependency: `sudo make install` must not run cargo as root.
install:
	@test -x dist/divebar || { echo "error: dist/divebar not found — run 'make build' first (without sudo)"; exit 1; }
	install -Dm755 dist/divebar $(BINDIR)/divebar

uninstall:
	rm -f $(BINDIR)/divebar

clean:
	rm -rf dist
	cd src-tauri && cargo clean
