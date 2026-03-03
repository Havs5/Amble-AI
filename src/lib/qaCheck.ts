export const QA_RULES = [
    {
        id: 'no_pii',
        label: 'No PII',
        description: 'Ensure no Personally Identifiable Information is included.',
        enabled: true
    },
    {
        id: 'tone_check',
        label: 'Tone Check',
        description: 'Verify the tone is professional and polite.',
        enabled: true
    },
    {
        id: 'fact_check',
        label: 'Fact Check',
        description: 'Verify factual claims against known data.',
        enabled: false
    }
];
