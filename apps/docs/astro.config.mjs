import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.meridian.dev',
  integrations: [
    starlight({
      title: 'MERIDIAN',
      description: 'Pre-execution intelligence for Stellar developers',
      favicon: '/favicon.svg',
      social: {
        github: 'https://github.com/armlynobinguar/meridian-core',
      },
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            href: 'https://meridian.dev',
            title: 'MERIDIAN',
          },
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});
