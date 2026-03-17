# Contentrain AI — Marketing Guide

This document is written for the marketing team. It explains what Contentrain AI is, who it's for, what problems it solves, and how to talk about it — all without requiring technical knowledge.

---

## What Is Contentrain AI?

**One sentence:** Contentrain AI is open-source infrastructure that gives structure, review, and delivery to AI-generated content.

**The analogy:** Think of it like a quality control system for a factory. The factory (AI agents like Claude, Cursor, ChatGPT) produces content very fast. But without quality control, the output is messy, inconsistent, and unmanageable. Contentrain is that quality control — it organizes, validates, reviews, and delivers what AI produces.

**What it is NOT:**
- It is NOT an AI content generator (we don't compete with Jasper, Writer, Copy.ai)
- It is NOT a traditional CMS (we don't compete with WordPress, Sanity, Strapi)
- It is NOT a translation service (we don't compete with Crowdin, Lokalise)

**What it IS:**
- The governance layer that sits between AI content generation and production delivery
- A set of tools that any AI agent can use to manage content properly
- An open-source project with a hosted product (Studio) for teams

---

## The Core Message

### Primary Positioning

> **"AI generates fast. Who governs what it produces?"**

This is the central question Contentrain answers. Every developer using AI tools (Cursor, Claude Code, GitHub Copilot) generates code and content at 10x speed. But there's no system for:
- Organizing the content that AI creates
- Reviewing it before it goes live
- Translating it
- Delivering it to multiple platforms

Contentrain fills this gap.

### The Tagline Options

| Context | Message |
|---|---|
| **Hero/Homepage** | "AI generates fast. Who governs what it produces?" |
| **Technical** | "Content governance infrastructure for AI-native teams" |
| **Pain-driven** | "500 hardcoded strings. One command to fix them all." |
| **Outcome-driven** | "Structure, review, and deliver AI-generated content — any platform, any agent" |
| **Short** | "Governance, not generation." |

### The Three-Word Formula

> **Agent generates. Human approves. System standardizes.**

Use this whenever you need to explain the workflow in one line.

---

## Who Is It For?

### Primary Audience: Developers Who Use AI Tools

These are developers who use AI coding assistants (Cursor, Claude Code, Windsurf, GitHub Copilot) to build projects. They generate code fast, but the content inside that code — text, labels, headlines, descriptions — has no structure.

**They are NOT looking for a CMS.** They are looking for a way to manage the mess that AI-assisted development creates.

### Four Personas

#### 1. Vibe Coder / Solo Developer

**Who:** Individual developer building side projects, micro-SaaS, or landing pages with AI assistance. Ships 50+ files per week.

**Their pain:**
- AI helped them build fast, but now content is scattered across every file
- Can't add a second language without touching every component
- Can't hand off text changes to anyone non-technical

**What to say to them:**
> "You shipped fast with AI. Now you have 500 hardcoded strings. One command extracts them all into structured, translatable content."

**Where they hang out:** Twitter/X, dev.to, Hacker News, Reddit (r/webdev, r/programming), YouTube coding channels, Discord servers

#### 2. Indie Hacker / Small Team (2-3 people)

**Who:** Building a SaaS product. Has a founder who wants to change copy, maybe a marketer who can't touch code.

**Their pain:**
- Every text change requires a developer
- i18n is always "next quarter"
- CMS is too complex for their stage

**What to say to them:**
> "No CMS dashboards. No API setup. Your AI agent manages content through Git. Your co-founder reviews in Studio."

**Where they hang out:** Indie Hackers, Twitter/X, Product Hunt, micro-SaaS communities

#### 3. Agency / Freelancer

**Who:** Builds projects for clients. Delivers 3-5 projects per quarter.

**Their pain:**
- Setting up content management for every client project
- Client keeps asking "can you change this text?"
- No scalable content handoff

**What to say to them:**
> "Same content setup for every client. 5 minutes to initialize. Hand them a Studio login and move on."

**Where they hang out:** Twitter/X, freelancer communities, agency Slack groups, LinkedIn

#### 4. Startup Team (5-15 people)

**Who:** Has developers, a marketer, maybe a PM. Building web + mobile.

**Their pain:**
- Marketer can't change content without a developer PR
- Web and mobile show different content
- No review process for AI-generated content

**What to say to them:**
> "Break the developer bottleneck. Agent generates, marketer reviews, same content on web and mobile."

**Where they hang out:** LinkedIn, Twitter/X, startup Slack communities, YC forums

---

## The Product Wedge: Normalize

**This is the most important marketing concept to understand.**

The "normalize" feature is how most developers will discover Contentrain. It's the entry point — the "aha moment."

### What Normalize Does (Non-Technical Explanation)

Every software project has hundreds of text strings written directly into the code:
- "Get started free"
- "Ship your next project in days"
- "Build faster with AI"

These strings are scattered across dozens of files. You can't translate them, you can't change them without a developer, and there's no single place to see them all.

**Normalize scans the entire project, finds all these strings, and organizes them into a structured content system.** In about 3 minutes. What would take a developer days of manual work.

### Why This Matters for Marketing

Normalize is:
- **The viral moment** — "This tool found 523 strings in my project in 30 seconds"
- **The free entry point** — works with open-source tools, no paid product needed
- **The gateway drug** — once content is structured, users naturally want translation, review, SDK, Studio

### The Funnel

```
Discovery:  "This tool found 500 strings!" (social share, word of mouth)
    ↓
Activation: npx contentrain init → normalize → content is structured
    ↓
Retention:  Developer uses structured content daily (SDK imports, i18n)
    ↓
Expansion:  Team grows → needs review workflow → Studio
    ↓
Revenue:    Studio paid tiers (team seats, CDN for mobile apps)
```

---

## Competitive Positioning

### We Are NOT Competing With:

| Category | Examples | Why We're Different |
|---|---|---|
| AI content generators | Jasper, Writer, Copy.ai | They generate content. We govern content that AI generates. We don't do generation. |
| Traditional CMS | WordPress, Sanity, Strapi, Contentful | They store content in databases with dashboards. We store in Git files with AI agents. |
| Translation tools | Crowdin, Lokalise, Phrase | They manage translations. We manage the entire content lifecycle including translation. |
| Static site CMS | Tina, Decap, Keystatic | They edit content in repos. We extract, structure, and govern content with AI agents. |

### Our Unique Position

Contentrain sits in an **unclaimed space**: the governance layer between AI generation and production delivery.

```
                    Content GOVERNANCE capability
                    Low ←─────────────────→ High

Content              │ Keystatic          ★ CONTENTRAIN ★
PRODUCTION           │ Tina/Decap
capability           │ Strapi
HIGH                 │ Sanity
                     │ Contentful
                     │────────────────────────────────
                     │ i18next
LOW                  │ vue-i18n
                     │ raw JSON files
```

### Key Differentiators (Use in All Messaging)

1. **AI-native** — Built for AI agents from day one (MCP protocol), not AI bolted onto a CMS
2. **Git-native** — Content lives in your Git repo, not a database. Full version history, branching, rollback
3. **Platform-independent** — Output is plain JSON/Markdown. Any language, any platform reads it (not just JavaScript)
4. **No vendor lock-in** — Stop using Contentrain tomorrow, your files are still there
5. **BYOA (Bring Your Own Agent)** — Works with any AI. We don't charge for AI, we don't sell AI
6. **Extract from existing code** — The normalize feature has no equivalent in any competing product

---

## Product Components

### Open Source (Free, MIT License)

| Component | What It Does | Why It Matters |
|---|---|---|
| **MCP Tools** | 13 tools that AI agents call to manage content | The core engine — this is what makes Contentrain work |
| **CLI** | Command-line interface for developers | How developers initialize, validate, generate, and review |
| **Query SDK** | TypeScript client for reading content | Optional convenience — content is plain JSON anyway |
| **Rules & Skills** | Quality guidelines for AI agents | Ensures AI agents follow consistent patterns |

### Hosted Product (Contentrain Studio)

| Feature | What It Does | Who Needs It |
|---|---|---|
| **Review UI** | Visual diff viewer for content changes | Teams that need approval workflows |
| **Team collaboration** | Invite editors, reviewers with roles | Multi-person teams |
| **Chat-first agent** | Talk to AI agent through web UI | Non-developers who want to create content |
| **Content CDN** | Deliver content over HTTP for mobile/desktop apps | Teams with non-web platforms |
| **GitHub integration** | Connect repos, manage branches | Professional workflows |

### Pricing Structure (Planned)

| Tier | Price | For |
|---|---|---|
| **Free** | $0 | Solo developers, unlimited with open-source tools |
| **Pro** | ~$12/month | CDN access, webhooks, 3 projects |
| **Team** | ~$29/month + seats | Team roles, unlimited projects, 10GB CDN |
| **Enterprise** | Custom | Self-hosted, SLA, dedicated support |

**Critical pricing principle:** We do NOT charge for AI operations. Users bring their own AI (BYOA). Contentrain sells infrastructure, not AI tokens.

---

## Content Strategy

### Content Pillars

1. **The Content Governance Problem** — Why AI-generated content needs governance
2. **Normalize Stories** — Real examples of extracting hardcoded strings
3. **Platform Independence** — Same content on web, mobile, desktop, anywhere
4. **Developer Experience** — How easy it is to set up and use
5. **Open Source Community** — Contributing, ecosystem, framework SDKs

### Content Formats (Priority Order)

| Format | Purpose | Example |
|---|---|---|
| **Twitter/X threads** | Awareness, viral potential | "I had 523 hardcoded strings in my Nuxt app. Fixed in 3 minutes. Here's how:" |
| **Demo GIF/video** | Show don't tell | 30-second normalize flow recording |
| **Blog posts** | SEO, depth | "Why AI-Generated Content Needs Governance" |
| **YouTube shorts** | Visual learners | Quick before/after of normalize |
| **GitHub README** | First impression | Hero section with GIF, quick start |
| **Dev.to / Hashnode** | Developer reach | Technical tutorials |
| **Product Hunt launch** | One-time spike | Planned launch with demo |

### Social Media Voice

**Tone:** Technical but accessible. Confident but not arrogant. Problem-focused, not feature-focused.

**Do say:**
- "Your AI generates content fast. Contentrain makes it manageable."
- "500 strings extracted in 3 minutes"
- "Plain JSON files in Git. No vendor lock-in. No AI fees."
- "Agent generates. Human approves. System standardizes."

**Don't say:**
- "AI-powered CMS" (we're not a CMS)
- "The best content tool" (generic, meaningless)
- "Powered by AI" (we don't do AI, the user's agent does)
- Anything about our AI being better (we don't have AI)

### SEO Keywords (Priority)

| Keyword | Intent | Competition |
|---|---|---|
| "manage hardcoded strings" | Problem search | Low |
| "AI content governance" | Category defining | Very low (we own this) |
| "MCP content tools" | Technical discovery | Low |
| "extract strings from code" | Problem search | Medium |
| "git based content management" | Alternative search | Medium |
| "contentrain" | Brand | Low |
| "i18n automation" | Problem search | Medium |
| "content management for AI projects" | Category search | Low |

---

## Launch Plan

### Pre-Launch Checklist

- [ ] GitHub README with hero GIF/video
- [ ] Demo repository (clone and try in 2 minutes)
- [ ] Product Hunt draft
- [ ] Twitter/X launch thread draft
- [ ] 3 blog posts ready (governance problem, normalize walkthrough, comparison)
- [ ] Documentation site live (ai.contentrain.io)
- [ ] MCP tool registry listing

### Launch Day

1. **Morning:** Product Hunt goes live
2. **Morning:** Twitter/X thread posted
3. **Midday:** Hacker News "Show HN" post
4. **Afternoon:** Dev.to / Hashnode cross-posts
5. **All day:** Engage with every comment

### Post-Launch (Week 1-4)

- Weekly blog post or tutorial
- Community Discord or GitHub Discussions
- Engage with users who report issues
- Collect testimonials / usage stories
- Iterate on messaging based on what resonates

---

## Metrics to Track

| Metric | What It Tells You | Target (6 months) |
|---|---|---|
| **GitHub stars** | Awareness, credibility | 1,000 |
| **npm downloads/month** | Active usage | 5,000 |
| **`contentrain init` executions** | Activation | 500 projects |
| **Normalize usage** | Wedge validation | 100 projects |
| **Studio signups** | Conversion to hosted | 200 |
| **Studio WAR (Weekly Active Reviews)** | Engagement depth | 200 reviews/week |
| **Social mentions** | Word of mouth | Track weekly |
| **Documentation page views** | Interest depth | Track weekly |

### Leading Indicators (Early Warning)

- If normalize < 10% of inits → the wedge isn't working, messaging needs change
- If Studio return rate < 20% weekly → habit isn't forming, UX problem
- If social mentions focus on "CMS" → positioning isn't landing, clarify governance

---

## Key Resources

| Resource | URL | Purpose |
|---|---|---|
| Documentation | https://ai.contentrain.io | Public docs site |
| GitHub Repo | https://github.com/Contentrain/ai | Open source code |
| npm Packages | Search "@contentrain" on npmjs.com | Published packages |
| Studio | https://studio.contentrain.io | Hosted product |
| Sitemap | https://ai.contentrain.io/sitemap.xml | SEO indexing |

---

## Quick Reference: The Elevator Pitch

**10 seconds:**
> "Contentrain governs AI-generated content — structure, review, and deliver across any platform."

**30 seconds:**
> "Developers using AI tools generate content 10x faster, but it ends up scattered and unmanageable. Contentrain extracts it into structured models, validates it, and delivers it as plain JSON to any platform — web, mobile, desktop. Everything goes through Git, everything is reviewable."

**60 seconds:**
> "Every developer using Cursor, Claude, or Copilot has the same problem: they ship fast, but the content inside their code — headlines, labels, descriptions — is hardcoded everywhere. Can't translate it, can't hand it to a marketer, can't serve it to a mobile app. Contentrain solves this. Run one command, your AI agent extracts every string into structured content. From there it's translatable, reviewable, and deliverable to any platform as plain JSON. No vendor lock-in, no AI fees — it's open source and works with any AI agent."
