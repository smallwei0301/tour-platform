import '../globals.css';

import { RootDocument } from '../../src/components/layout/RootDocument';
import { siteMetadata } from '../../src/lib/seo/site-metadata';

export const metadata = siteMetadata;

export default function NonLocaleLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument lang="zh-Hant">{children}</RootDocument>;
}
