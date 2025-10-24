// OpenAI service for AI-powered lead scoring and reply classification
// Based on javascript_openai blueprint
import OpenAI from "openai";

// Deferred initialization to avoid crashing server when API key is missing
let openai: OpenAI | null = null;
let openaiAvailable: boolean | null = null;

function getOpenAI(): OpenAI {
  if (openaiAvailable === false) {
    throw new Error('OpenAI is not configured - OPENAI_API_KEY environment variable is missing');
  }
  
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      openaiAvailable = false;
      throw new Error('OpenAI operations require OPENAI_API_KEY environment variable');
    }
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    openaiAvailable = true;
  }
  return openai;
}

export function isOpenAIAvailable(): boolean {
  if (openaiAvailable === null) {
    openaiAvailable = !!process.env.OPENAI_API_KEY;
  }
  return openaiAvailable;
}

export interface LeadScoreResult {
  grade: "A" | "B" | "C";
  value: number;
  reason: string;
}

export interface ReplyClassification {
  category: "positive" | "neutral" | "ooo" | "not_interested" | "unsubscribe" | "booked";
  confidence: number;
  extractedMeetingTimes?: string[];
}

// Hybrid scoring: Rules baseline + OpenAI tiebreaker
function calculateRulesBaselineScore(lead: {
  person?: {
    title?: string;
  };
  company?: {
    revenue?: number;
    employeeCount?: number;
    industry?: string;
  };
}): { grade: "A" | "B" | "C"; value: number; reason: string } {
  let score = 50; // Start at baseline
  const reasons: string[] = [];

  // Title scoring
  const title = lead.person?.title?.toLowerCase() || '';
  if (title.includes('ceo') || title.includes('founder') || title.includes('owner')) {
    score += 25;
    reasons.push('decision-maker title');
  } else if (title.includes('vp') || title.includes('director') || title.includes('head')) {
    score += 15;
    reasons.push('senior title');
  } else if (title.includes('manager')) {
    score += 5;
    reasons.push('manager title');
  }

  // Company size scoring (revenue)
  const revenue = lead.company?.revenue;
  if (revenue) {
    if (revenue >= 10000000) { // $10M+
      score += 15;
      reasons.push('large revenue');
    } else if (revenue >= 1000000) { // $1M+
      score += 10;
      reasons.push('medium revenue');
    }
  }

  // Employee count
  const employees = lead.company?.employeeCount;
  if (employees) {
    if (employees >= 100) {
      score += 10;
      reasons.push('large team');
    } else if (employees >= 20) {
      score += 5;
      reasons.push('established team');
    }
  }

  // Cap at 100
  score = Math.min(100, score);

  // Determine grade
  let grade: "A" | "B" | "C";
  if (score >= 75) {
    grade = "A";
  } else if (score >= 50) {
    grade = "B";
  } else {
    grade = "C";
  }

  return {
    grade,
    value: score,
    reason: reasons.length > 0 ? reasons.join(', ') : 'baseline scoring',
  };
}

export async function scoreLead(lead: {
  person?: {
    title?: string;
    firstName?: string;
    lastName?: string;
  };
  company?: {
    name?: string;
    industry?: string;
    revenue?: number;
    employeeCount?: number;
  };
  contact: {
    email: string;
  };
}): Promise<LeadScoreResult> {
  // First, calculate rules-based score
  const rulesScore = calculateRulesBaselineScore(lead);
  
  // If OpenAI is not available, return rules score
  if (!isOpenAIAvailable()) {
    return rulesScore;
  }

  // If score is clearly A or C, skip OpenAI (cost optimization)
  if (rulesScore.value >= 85 || rulesScore.value <= 35) {
    return rulesScore;
  }

  // Use OpenAI as tiebreaker for borderline cases (B grade range)
  try {
    const prompt = `You are a B2B lead scoring expert. A rules-based system scored this lead as "${rulesScore.grade}" (${rulesScore.value}/100) because: ${rulesScore.reason}.

Analyze this lead and determine if the grade should be adjusted up or down:

Lead Details:
- Name: ${lead.person?.firstName} ${lead.person?.lastName}
- Title: ${lead.person?.title || 'Unknown'}
- Company: ${lead.company?.name || 'Unknown'}
- Industry: ${lead.company?.industry || 'Unknown'}
- Revenue: ${lead.company?.revenue ? `$${lead.company.revenue}` : 'Unknown'}
- Employee Count: ${lead.company?.employeeCount || 'Unknown'}
- Email: ${lead.contact.email}

Respond with JSON in this exact format:
{
  "grade": "A" | "B" | "C",
  "value": number (0-100),
  "reason": "brief explanation"
}`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert B2B sales analyst. Grade A = decision maker at target company with strong fit. Grade B = good fit but may need nurturing. Grade C = weak fit or unclear role."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 256,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      grade: result.grade || "C",
      value: Math.max(0, Math.min(100, result.value || 50)),
      reason: result.reason || "Unable to determine score",
    };
  } catch (error) {
    console.error('Lead scoring error:', error);
    // Fallback to rule-based scoring
    let grade: "A" | "B" | "C" = "C";
    let value = 30;
    
    if (lead.person?.title && ['ceo', 'cto', 'cfo', 'founder', 'owner', 'director', 'vp'].some(t => 
      lead.person!.title!.toLowerCase().includes(t)
    )) {
      grade = "A";
      value = 85;
    } else if (lead.person?.title && ['manager', 'lead', 'head'].some(t => 
      lead.person!.title!.toLowerCase().includes(t)
    )) {
      grade = "B";
      value = 65;
    }

    return {
      grade,
      value,
      reason: "Scored based on title and company fit",
    };
  }
}

export async function classifyReply(emailContent: string): Promise<ReplyClassification> {
  try {
    const prompt = `Classify this email reply into one of these categories:
- positive: interested, wants more info, asking questions
- neutral: acknowledging but noncommittal
- ooo: out of office auto-reply
- not_interested: clearly not interested, asking to stop
- unsubscribe: requesting removal from list
- booked: proposing meeting times or confirming meeting

Email:
${emailContent}

Respond with JSON:
{
  "category": "positive" | "neutral" | "ooo" | "not_interested" | "unsubscribe" | "booked",
  "confidence": number (0-1),
  "extractedMeetingTimes": ["array of any mentioned times/dates"] or null
}`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at classifying email responses for sales outreach."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 256,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      category: result.category || "neutral",
      confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
      extractedMeetingTimes: result.extractedMeetingTimes || undefined,
    };
  } catch (error) {
    console.error('Reply classification error:', error);
    return {
      category: "neutral",
      confidence: 0.3,
    };
  }
}
