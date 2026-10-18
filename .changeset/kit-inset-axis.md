---
'@contentrain/astro-kit': minor
---

A new `inset` axis on Prose, Hero and Band: `none` (the default, drawn as before) or `15`, `27`, `34`, `42`. From md (768px) up, the content column's start edge sits at that share of its container's width (a logical `margin-inline-start`, so in RTL the axis is measured from the right) and runs to the container's end. Below md nothing changes. Hero takes it on layout `centered` only, its text then set at the axis instead of centred (split and cover ignore it). Band takes it on layout `stack` only, moving its copy, image and items, a centred band's text to the axis too. Prose's share is of the container it sits in.
