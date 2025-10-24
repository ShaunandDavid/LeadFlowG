// Template variable substitution and rendering engine

export interface TemplateVariables {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  title?: string;
  company?: string;
  industry?: string;
  email?: string;
  [key: string]: string | undefined;
}

export function substituteVariables(template: string, variables: TemplateVariables): string {
  let result = template;
  
  // Replace {{variableName}} patterns
  const variablePattern = /\{\{(\w+)\}\}/g;
  
  result = result.replace(variablePattern, (match, varName) => {
    const value = variables[varName];
    return value !== undefined ? value : match; // Keep placeholder if variable not found
  });
  
  return result;
}

export function extractVariables(template: string): string[] {
  const variablePattern = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  
  let match;
  while ((match = variablePattern.exec(template)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

export function validateQuietHours(time: Date, quietHours?: { start: number; end: number }): boolean {
  if (!quietHours) return true;
  
  const hours = time.getHours();
  const quietStart = quietHours.start;
  const quietEnd = quietHours.end;
  
  // Check if we're in quiet hours
  if (quietEnd < quietStart) {
    // Wraps midnight (e.g., 22:00-06:00)
    // NOT in quiet hours if: hours < quietStart AND hours >= quietEnd
    return hours < quietStart && hours >= quietEnd;
  } else {
    // Normal range (e.g., 01:00-05:00)
    // NOT in quiet hours if: hours < quietStart OR hours >= quietEnd
    return hours < quietStart || hours >= quietEnd;
  }
}

export function calculateSendTime(
  baseTime: Date,
  timeWindow?: { days?: number[]; startHour: number; endHour: number },
  quietHours?: { start: number; end: number },
  timezone: string = 'America/New_York'
): Date {
  // Convert to local timezone
  let localTime = new Date(baseTime.toLocaleString('en-US', { timeZone: timezone }));
  const originalTime = new Date(localTime);
  
  // Apply both constraints iteratively until both are satisfied
  // Max 10 iterations to prevent infinite loops
  let iterations = 0;
  const maxIterations = 10;
  
  while (iterations < maxIterations) {
    iterations++;
    let adjusted = false;
    
    // Step 1: Check quiet hours
    if (quietHours) {
      const hours = localTime.getHours();
      const quietStart = quietHours.start;
      const quietEnd = quietHours.end;
      
      let inQuietHours = false;
      if (quietEnd < quietStart) {
        // Wraps midnight (e.g., 22:00-06:00)
        inQuietHours = hours >= quietStart || hours < quietEnd;
      } else {
        // Normal range (e.g., 01:00-05:00)
        inQuietHours = hours >= quietStart && hours < quietEnd;
      }
      
      if (inQuietHours) {
        // Move to end of quiet hours
        localTime.setHours(quietEnd, 0, 0, 0);
        
        // If this is earlier than originalTime, move to next day
        if (localTime < originalTime) {
          localTime.setDate(localTime.getDate() + 1);
        }
        adjusted = true;
      }
    }
    
    // Step 2: Check time window
    if (timeWindow) {
      const hours = localTime.getHours();
      const day = localTime.getDay();
      
      // Check day of week constraints
      if (timeWindow.days && !timeWindow.days.includes(day)) {
        // Find next allowed day
        let daysToAdd = 1;
        let nextDay = (day + daysToAdd) % 7;
        while (!timeWindow.days.includes(nextDay) && daysToAdd < 7) {
          daysToAdd++;
          nextDay = (day + daysToAdd) % 7;
        }
        localTime.setDate(localTime.getDate() + daysToAdd);
        localTime.setHours(timeWindow.startHour, 0, 0, 0);
        adjusted = true;
      } else if (hours < timeWindow.startHour) {
        localTime.setHours(timeWindow.startHour, 0, 0, 0);
        adjusted = true;
      } else if (hours >= timeWindow.endHour) {
        // Move to next day, start of window
        localTime.setDate(localTime.getDate() + 1);
        localTime.setHours(timeWindow.startHour, 0, 0, 0);
        
        // Check if next day is allowed
        if (timeWindow.days) {
          const nextDay = localTime.getDay();
          if (!timeWindow.days.includes(nextDay)) {
            // Find next allowed day
            let daysToAdd = 1;
            let checkDay = (nextDay + daysToAdd) % 7;
            while (!timeWindow.days.includes(checkDay) && daysToAdd < 7) {
              daysToAdd++;
              checkDay = (nextDay + daysToAdd) % 7;
            }
            localTime.setDate(localTime.getDate() + daysToAdd);
          }
        }
        adjusted = true;
      }
    }
    
    // If no adjustments were made, both constraints are satisfied
    if (!adjusted) {
      break;
    }
  }
  
  // Final safety check: ensure result is never earlier than original baseTime
  if (localTime < originalTime) {
    // This shouldn't happen with the loop above, but as a failsafe:
    localTime = new Date(originalTime);
    localTime.setDate(localTime.getDate() + 1);
    if (timeWindow) {
      localTime.setHours(timeWindow.startHour, 0, 0, 0);
    } else if (quietHours) {
      localTime.setHours(quietHours.end, 0, 0, 0);
    }
  }
  
  return localTime;
}

// Industry-specific template packs
export const INDUSTRY_TEMPLATES = {
  roofing: [
    {
      name: "Roof Inspection Offer",
      subject: "Free roof inspection for {{company}}?",
      body: `Hi {{firstName}},

I noticed {{company}} has been in business for a while, and I wanted to reach out with a quick offer.

We're offering free roof inspections to local businesses in {{industry}}. With recent weather, many roofs have hidden damage that could lead to costly repairs down the line.

Would you be interested in scheduling a quick inspection? No obligation – just peace of mind.

Best,
[Your Name]`,
      variables: ["firstName", "company", "industry"],
    },
    {
      name: "Storm Damage Follow-up",
      subject: "Storm damage assessment - {{company}}",
      body: `Hi {{firstName}},

After last week's storm, we're reaching out to businesses in the area to offer free damage assessments.

{{company}} might have sustained roof damage that isn't immediately visible. Catching these issues early can save thousands in repairs.

Can we schedule a quick assessment this week?

Best regards,
[Your Name]`,
      variables: ["firstName", "company"],
    },
  ],
  dental: [
    {
      name: "Equipment Upgrade Opportunity",
      subject: "New dental equipment options for {{company}}",
      body: `Hi Dr. {{lastName}},

I hope this email finds you well. I'm reaching out because {{company}} has been on our radar as a practice that values quality patient care.

We've recently launched a new line of dental equipment that's been getting great feedback from practitioners. Would you be open to a brief demo?

Looking forward to connecting,
[Your Name]`,
      variables: ["lastName", "company"],
    },
  ],
  solar: [
    {
      name: "Commercial Solar Assessment",
      subject: "Solar savings estimate for {{company}}",
      body: `Hi {{firstName}},

Commercial properties like {{company}} are ideal candidates for solar installation. Based on your location and estimated usage, you could be saving significantly on energy costs.

Would you be interested in a free solar assessment? No pressure – just useful information about potential savings.

Best,
[Your Name]`,
      variables: ["firstName", "company"],
    },
  ],
  hvac: [
    {
      name: "HVAC Maintenance Program",
      subject: "Preventive maintenance for {{company}}",
      body: `Hi {{firstName}},

I wanted to reach out about our preventive maintenance program for commercial HVAC systems.

{{company}} could benefit from regular maintenance that prevents costly breakdowns and extends equipment life.

Do you have 10 minutes this week to discuss how we could help?

Best regards,
[Your Name]`,
      variables: ["firstName", "company"],
    },
  ],
  general: [
    {
      name: "Introduction & Value Proposition",
      subject: "Quick question for {{company}}",
      body: `Hi {{firstName}},

I came across {{company}} and was impressed by your work in {{industry}}.

I wanted to briefly introduce [Your Company] and see if there might be an opportunity to work together.

Would you be open to a brief call next week?

Best,
[Your Name]`,
      variables: ["firstName", "company", "industry"],
    },
  ],
};
