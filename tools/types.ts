/**
 * Minimal structural views of the topic/article data shared by tools.
 * Deliberately decoupled from schema/ zod types so tools can run before
 * schema lands; validate-topic.ts (schema-backed) is the enforcement gate.
 */

export interface MetricsView {
  editorialWeight: number;
  sourceVolume: number;
  independentSignals: number;
  momentum: number;
  emergence: number;
  confidence: number;
  status: string;
}

export interface NodeView {
  position: { x: number; y: number };
  size: { w: number; h: number };
  borderRadius: string;
  opacity: number;
  mobile?: { x: number; y: number; w: number; h: number; opacity?: number };
  metrics: MetricsView;
}

export interface StateView {
  period: string;
  label: string;
  question: string;
  synthesis: string;
  lineStrength: number;
  nodes: Record<string, NodeView>;
}

export interface AccessPolicyView {
  access: string;
  license: string;
  reuse: string;
  fullText: boolean;
  summary: boolean;
  link: boolean;
  pendingVerification: boolean;
}

export interface SourceRefView {
  id: string;
  publisher: string;
  title: string;
  description: string;
  date: string;
  type: string;
  url: string;
  accessPolicy: AccessPolicyView;
  storyCluster: string;
  originalReporting: boolean;
  stance: string;
  perspectives: string[];
}

export interface PerspectiveView {
  id: string;
  name: string;
  category: string;
  color?: string;
  summary: string;
  coreArgument: string;
  counterArgument: string;
  bodies: string[];
  sparkline: number[];
  history: string[];
  sources: string[];
  windows?: { y: number; q: number; m: number; w: number };
  arguments?: Array<{ id: string; statement: string; momentum: "up" | "down"; sources: string[] }>;
}

export interface RelationView {
  from: string;
  to: string;
  strength: number;
  reason: string;
}

export interface TimelineEntryView {
  label: string;
  headline: string;
  perspectives: Record<string, { theme: string; changed: string; keywords: string[]; summary: string }>;
}

export interface TopicView {
  slug: string;
  title: string;
  subtitle: string;
  kicker: string;
  date: string;
  nav: string[];
  activeNav: string;
  states: StateView[];
  perspectives: PerspectiveView[];
  relations: RelationView[];
  timeline?: TimelineEntryView[];
}

export interface ArticleCacheView {
  articles: SourceRefView[];
  migratedFrom?: string;
}

export interface PublisherEntry {
  name: string;
  tier: number;
  policy: AccessPolicyView;
  notes?: string;
  region?: string;
}

export interface PublishersView {
  publishers: PublisherEntry[];
}

export interface TopicManifest {
  topics: { slug: string; title: string; file: string; added: string }[];
  active: string;
}
