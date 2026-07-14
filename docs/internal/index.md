# Internal Maintainer Documentation

This directory is for Sparge maintainers and producer operators. It is intentionally excluded from the public MkDocs navigation.

These documents describe development and operation of the official chain. They are not instructions for regular users and are not a template for launching another chain.

## Core maintenance guides

- [Node Development Guide](node-development.md): request validation, limits, mempool behavior, invariants, logging, and test architecture.
- [Operator Guide](operator-guide.md): producer deployment, HTTPS, monitoring, dashboard, backups, restore, replay, recovery, and upgrades.
- [Configuration Reference](configuration.md): protocol-sensitive and operational configuration.
- [Discord Community Identity Operations](discord-community-identity.md): OAuth application, bot roles, secrets, synchronization, and incident response.
- [Test Procedures](test-procedures.md): regression suites and release evidence.

## Release and review

- [Public Alpha Launch Checklist](launch-checklist-alpha.md)
- [Release Template](release-template.md)
- [Review Packet](review-packet.md)
- [Review Evidence Template](review-evidence-template.md)
- [Documentation Audit](documentation-audit.md)

## Publication rule

Do not add this directory to `mkdocs.yml`. Public-facing concepts must be rewritten for users or external builders before being added to the public documentation set.
