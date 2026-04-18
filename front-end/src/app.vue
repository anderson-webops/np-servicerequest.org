<script setup lang="ts">
import { appName } from '~/constants'

const colorMode = useColorMode()

useHead({
  title: appName,
  meta: [{
    id: 'theme-color-active',
    name: 'theme-color',
    content: () => colorMode.value === 'dark' ? '#0d1510' : '#f5f0e5',
  }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
:root {
  --page-inline: clamp(1.25rem, 4vw, 5rem);
  --page-inline-start: max(var(--page-inline), env(safe-area-inset-left));
  --page-inline-end: max(var(--page-inline), env(safe-area-inset-right));
  --page-block-start: max(0px, env(safe-area-inset-top));
  --page-block-end: max(0px, env(safe-area-inset-bottom));
  --site-bg-start: #f5f0e5;
  --site-bg-end: #efe7d8;
  --site-bg-accent: rgba(165, 196, 177, 0.42);
  --site-text: #33433a;
  --site-heading: #162219;
  --site-text-strong: #17231b;
  --site-muted: #6d7267;
  --site-subtle: #526257;
  --site-link: #294635;
  --site-link-hover: #1d3528;
  --site-surface: rgba(255, 250, 243, 0.84);
  --site-surface-soft: rgba(255, 250, 243, 0.72);
  --site-surface-strong: rgba(255, 250, 243, 0.96);
  --site-elevated: rgba(255, 255, 255, 0.78);
  --site-elevated-strong: rgba(255, 255, 255, 0.96);
  --site-input-bg: rgba(255, 255, 255, 0.88);
  --site-input-text: #1c2a21;
  --site-border: rgba(40, 58, 45, 0.08);
  --site-border-strong: rgba(40, 58, 45, 0.12);
  --site-border-dashed: rgba(40, 58, 45, 0.16);
  --site-accent-soft: rgba(41, 70, 53, 0.08);
  --site-accent-soft-strong: rgba(41, 70, 53, 0.22);
  --site-accent-ghost: rgba(255, 255, 255, 0.16);
  --site-focus: rgba(41, 70, 53, 0.32);
  --site-focus-ring: rgba(41, 70, 53, 0.1);
  --site-button-bg: #294635;
  --site-button-bg-hover: #1d3528;
  --site-button-text: #f8f5ee;
  --site-shadow: 0 24px 50px rgba(52, 66, 56, 0.08);
  --site-shadow-strong: 0 32px 70px rgba(53, 69, 57, 0.14);
  --site-success-bg: rgba(92, 148, 103, 0.12);
  --site-success-text: #24402e;
  --site-error-bg: rgba(148, 91, 82, 0.12);
  --site-error-text: #6a2d23;
  --site-highlight: rgba(121, 159, 129, 0.12);
  --site-poster-start: rgba(255, 250, 243, 0.96);
  --site-poster-end: rgba(244, 234, 216, 0.92);
  --site-header-bg: linear-gradient(180deg, rgba(245, 240, 229, 0.96), rgba(245, 240, 229, 0.82));
  --site-header-border: rgba(37, 50, 41, 0.08);
}

html,
body,
#__nuxt {
  min-height: 100%;
  margin: 0;
  padding: 0;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

img,
svg,
video {
  display: block;
  max-width: 100%;
  height: auto;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 6rem;
  background: var(--site-bg-start);
}

body,
#__nuxt {
  min-height: 100vh;
}

body {
  background: var(--site-bg-start);
  color: var(--site-text);
  overflow-x: hidden;
  transition:
    background-color 220ms ease,
    color 220ms ease;
  -webkit-tap-highlight-color: rgba(41, 70, 53, 0.12);
}

html.dark {
  color-scheme: dark;
  --site-bg-start: #0d1510;
  --site-bg-end: #111c15;
  --site-bg-accent: rgba(89, 124, 102, 0.18);
  --site-text: #d3ddd4;
  --site-heading: #eff5ee;
  --site-text-strong: #f4f8f1;
  --site-muted: #9aa89c;
  --site-subtle: #afbaae;
  --site-link: #b8d3c0;
  --site-link-hover: #d6e7d9;
  --site-surface: rgba(19, 29, 23, 0.84);
  --site-surface-soft: rgba(19, 29, 23, 0.72);
  --site-surface-strong: rgba(24, 35, 28, 0.96);
  --site-elevated: rgba(30, 44, 35, 0.82);
  --site-elevated-strong: rgba(43, 58, 48, 0.96);
  --site-input-bg: rgba(15, 23, 18, 0.9);
  --site-input-text: #eff5ee;
  --site-border: rgba(195, 225, 199, 0.1);
  --site-border-strong: rgba(195, 225, 199, 0.18);
  --site-border-dashed: rgba(195, 225, 199, 0.24);
  --site-accent-soft: rgba(142, 177, 149, 0.16);
  --site-accent-soft-strong: rgba(184, 221, 192, 0.28);
  --site-accent-ghost: rgba(255, 255, 255, 0.12);
  --site-focus: rgba(171, 211, 179, 0.38);
  --site-focus-ring: rgba(171, 211, 179, 0.18);
  --site-button-bg: #d6e7d9;
  --site-button-bg-hover: #eef7ef;
  --site-button-text: #142019;
  --site-shadow: 0 24px 50px rgba(0, 0, 0, 0.24);
  --site-shadow-strong: 0 32px 70px rgba(0, 0, 0, 0.34);
  --site-success-bg: rgba(90, 171, 114, 0.16);
  --site-success-text: #dff0e2;
  --site-error-bg: rgba(181, 95, 82, 0.18);
  --site-error-text: #ffd9d1;
  --site-highlight: rgba(171, 211, 179, 0.12);
  --site-poster-start: rgba(24, 35, 28, 0.96);
  --site-poster-end: rgba(17, 28, 21, 0.92);
  --site-header-bg: linear-gradient(180deg, rgba(13, 21, 16, 0.96), rgba(13, 21, 16, 0.82));
  --site-header-border: rgba(195, 225, 199, 0.1);
}
</style>
