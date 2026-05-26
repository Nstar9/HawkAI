export type EntityType = "company" | "person" | "fund";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SignalType =
  | "reputational"
  | "financial"
  | "regulatory"
  | "litigation"
  | "sanctions"
  | "governance"
  | "fraud"
  | "other";

export type InvestigationStatus = "pending" | "running" | "completed" | "failed";

export type InvestigationStepName = "research" | "intelligence" | "complete";

export interface InvestigationCreate {
  entity_name: string;
  entity_type: EntityType;
  context?: string;
}

export interface InvestigationStep {
  name: InvestigationStepName;
  status: InvestigationStatus;
  message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface RiskSignal {
  id: string;
  entity_id: string;
  investigation_id?: string;
  signal_type: SignalType;
  severity: RiskLevel;
  title: string;
  description: string;
  confidence: number;
  sources: string[];
  created_at: string;
}

export interface RiskReport {
  overall_risk_score: number;
  risk_level: RiskLevel;
  executive_summary: string;
  key_findings: string[];
  recommendations: string[];
  correlated_entities: string[];
}

export interface InvestigationResult {
  entity_id?: string;
  report?: RiskReport;
  signals: RiskSignal[];
}

export interface Investigation extends InvestigationCreate {
  id: string;
  status: InvestigationStatus;
  steps: InvestigationStep[];
  result?: InvestigationResult;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  aliases: string[];
  summary?: string;
  risk_score?: number;
  risk_level?: RiskLevel;
  analyst_notes: AnalystNote[];
  created_at: string;
  updated_at: string;
}

export interface AnalystNote {
  id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}
