---
title: Contentrain Studio
description: "Open-core team operations and delivery for the same Git-native content contract used by Contentrain AI"
order: 3
category: getting-started
slug: studio
---

# Contentrain Studio

Contentrain Studio is the open-core team operations and delivery surface for Git-native structured content.

In short:

> Contentrain AI gives developers local-first packages and agent workflows. Studio gives teams an authenticated web surface for review, collaboration, media, APIs, and CDN delivery on top of the same `.contentrain/` contract.

Teams can self-host the AGPL core or use a managed Pro/Enterprise offering, depending on how much infrastructure and operations they want to own.

It is not a separate content format and it is not a different storage engine. Studio sits on top of the same Contentrain model:

- content lives in Git
- content is schema-based
- changes are written through branches, commits, and diffs
- agents and humans operate on the same governed content layer
- the same content can later be delivered through files, SDK queries, or CDN endpoints

## What Studio Is

Studio is the team-facing web application in the Contentrain ecosystem.

It combines three layers:

- **Management layer** — workspaces, projects, members, permissions, and AI configuration
- **Content execution layer** — chat-driven and UI-driven content operations backed by Git
- **Delivery layer** — CDN publishing, API access, media, and external conversation endpoints

If the open-source stack is the local operating core, Studio is the collaboration and delivery surface.

## What Studio Handles

Based on the current product surface, Studio covers these categories:

1. authentication and session management
2. workspace and project management
3. chat-based content operations
4. structured content writing and review workflows
5. branch and diff management
6. media management
7. CDN-based content delivery
8. external conversation API
9. form submission management
10. client-side content cache and search

## Operating Model

Studio is not database-first. It is Git-first.

The core flow looks like this:

1. a user works inside a workspace and project
2. the project is connected to a Git repo
3. the user requests a change
4. the request reaches the server through chat or an API route
5. permissions are checked
6. the content engine validates, serializes, opens a branch, and creates a commit
7. the workflow either auto-merges or leaves a review branch open
8. the UI exposes the result through conversations, branches, diffs, and snapshots

That means Studio is not just a dashboard. It is the governed web operating surface for reviewable content operations.

## Package Bridges

Studio is where the AI package surfaces meet team operations:

| AI surface | What starts in AI | What continues in Studio |
|---|---|---|
| `@contentrain/mcp` | deterministic local content operations, normalize, validation | governed web workflows, review, approval, project-level operations |
| `contentrain` CLI | init, serve, diff, generate, validate | authenticated review, role-based collaboration, project/workspace management |
| `@contentrain/rules` | quality and schema guardrails | shared content quality expectations across chat, review, and validation |
| `@contentrain/skills` | workflow playbooks and promotion hints | mirrored chat-led workflows, onboarding moments, and review handoffs |
| `@contentrain/query` | local typed consumption and CDN transport | remote delivery, API key management, CDN publishing, and non-web distribution |

## Core Concepts

### Workspace

The workspace is the team, billing, and permission boundary.

Studio can:

- list available workspaces
- create new workspaces
- update workspace settings
- manage members
- enforce workspace-level roles

### Project

A project is a repo-connected unit inside a workspace.

Studio can:

- list accessible projects
- connect new projects to repositories
- fetch project details
- manage project-level access

### Structured Content

Studio uses the same four model kinds as Contentrain:

- collection
- singleton
- document
- dictionary

The point is not to create a separate Studio-only model. The point is to operate the same structured content layer through a team web app.

## Auth, Roles, and Permissions

Studio is an authenticated application with role-aware access.

Supported auth flows:

- GitHub OAuth
- Google OAuth
- magic link

Permissions are layered:

- workspace roles: `owner`, `admin`, `member`
- project roles: `editor`, `reviewer`, `viewer`
- model-level restrictions where needed

This matters because Studio is not just “can the user log in?” It is “who can change which project, which models, and which workflows?”

## Chat-First Content Operations

One of Studio's defining features is chat.

But this is not an open-ended chatbot. It is a bounded, tool-driven content operations interface:

- user message enters with project context
- permissions and phase rules are applied
- the system builds the right agent/tool context
- tool calls are executed through the governed content path
- results stream back to the UI

So the chat surface is an operations UI, not a generic assistant shell.

## Content Engine

The content engine is the execution core behind Studio.

It is responsible for:

- reading model definitions
- loading current content
- validating data
- resolving content paths
- serializing canonically
- creating branches and commits
- producing diffs

Supported operations include:

- content save
- document save
- content delete
- model save
- entry status update
- locale copy
- project init
- branch merge / reject

Neither the UI nor the AI writes directly to Git. The content engine does.

## Review, Branches, and Diffs

Studio is built around reviewable content changes.

It provides:

- pending branch listings
- branch diff inspection
- merge and reject flows
- conversation-linked review context

This is one of the clearest places where Studio stops being “content admin UI” and becomes “team operations panel.”

## Delivery, CDN, and APIs

Studio is not only about editing content. It also handles delivery.

That includes:

- CDN publishing
- CDN keys and access control
- build history and triggers
- public delivery routes
- external conversation API keys and scoped access

This makes Studio useful for:

- mobile apps
- desktop apps
- game engines
- other platforms that cannot read from Git directly at runtime

## Media and Content-In Flows

Studio also extends the ecosystem with adjacent operational capabilities:

- media upload and asset management
- metadata and variants
- forms and submission review
- client-side cached snapshots and search

These are not side details. They matter because team content operations rarely end at “edit a JSON file.”

## Relationship to the Open-Source Stack

The open-source stack remains the foundation:

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/rules`
- `@contentrain/skills`

Studio is the open-core web layer on top:

- team access
- web workflows
- review UX
- media
- delivery

So the split is:

- **open-source Contentrain** = local, Git-native content governance core
- **Contentrain Studio** = team operations and delivery layer for the same content contract

## Go Deeper

- [Ecosystem Map](/ecosystem)
- [Studio AI Chat](https://docs.contentrain.io/guide/ai-chat)
- [Studio Branches & Review](https://docs.contentrain.io/guide/branches-and-review)
- [Studio CDN](https://docs.contentrain.io/guide/cdn)
- [Studio Self-Hosting](https://docs.contentrain.io/developer/self-hosting)

## Short Definition

Contentrain Studio is a web application that lets teams manage structured content living in Git through chat, visual workflows, branch review, and delivery APIs.
