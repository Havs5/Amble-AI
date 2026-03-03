import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';

// --- Tool Definitions ---

export const TOOLS_DEFINITION = [
  {
    type: 'function',
    function: {
      name: 'get_patient_details',
      description: 'Retrieve detailed demographic and medical summary for a patient by ID.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'The unique ID of the patient (e.g. "pat_123")' }
        },
        required: ['patientId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_billing_codes',
      description: 'Search for CPT, ICD-10, or HCPCS billing codes and their descriptions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The code or keyword to search for (e.g. "99213" or "office visit")' },
          type: { type: 'string', enum: ['cpt', 'icd', 'hcpcs'], description: 'Optional filter for code type' }
        },
        required: ['query']
      }
    }
  }
];

// --- Tool Executions ---

export class ToolExecutor {
  
  static async execute(toolName: string, args: any): Promise<any> {
    console.log(`[ToolExecutor] Executing ${toolName}`, args);
    
    switch (toolName) {
      case 'get_patient_details':
        return await this.getPatientDetails(args.patientId);
      
      case 'search_billing_codes':
        return await this.searchBillingCodes(args.query, args.type);
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private static async getPatientDetails(patientId: string) {
    // Mock implementation for demo/safety - in prod, query adminDb
    if (patientId === 'test_pat') {
        return {
            id: 'test_pat',
            name: 'Jane Smith',
            dob: '1980-05-15',
            conditions: ['Hypertension', 'Type 2 Diabetes'],
            lastVisit: '2024-12-01'
        };
    }
    // Try Firestore
    try {
        const doc = await adminDb.collection('patients').doc(patientId).get();
        if (doc.exists) {
            const data = doc.data() || {};
            // Filter sensitive fields if necessary
            return { id: doc.id, ...data };
        }
        return { error: 'Patient not found' };
    } catch (e: any) {
        return { error: `Database error: ${e.message}` };
    }
  }

  private static async searchBillingCodes(query: string, type?: string) {
    // Mock Knowledge Base Search
    // In reality, this would query a dedicated 'codes' collection or external API
    
    const mockDb = [
        { code: '99213', type: 'cpt', desc: 'Office or other outpatient visit for the evaluation and management of an established patient (15 mins)' },
        { code: '99214', type: 'cpt', desc: 'Office or other outpatient visit for the evaluation and management of an established patient (25 mins)' },
        { code: 'I10', type: 'icd', desc: 'Essential (primary) hypertension' },
        { code: 'E11.9', type: 'icd', desc: 'Type 2 diabetes mellitus without complications' }
    ];

    const results = mockDb.filter(item => {
        const matchesQuery = item.code.includes(query) || item.desc.toLowerCase().includes(query.toLowerCase());
        const matchesType = type ? item.type === type : true;
        return matchesQuery && matchesType;
    });

    return {
        results: results.length > 0 ? results : [],
        count: results.length,
        message: results.length === 0 ? "No codes found. Try a different query." : "Found matching codes."
    };
  }
}
