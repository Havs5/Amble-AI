export interface Organization {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    createdAt: number | Date;
    settings: {
        allowedDomains?: string[];
        defaultModel?: string;
        maxSeats?: number;
    };
    subscription?: {
        planId: 'free' | 'pro' | 'enterprise';
        status: 'active' | 'past_due' | 'canceled';
        currentPeriodEnd: number;
    };
}

export interface OrgMember {
    userId: string;
    role: 'owner' | 'admin' | 'editor' | 'viewer';
    joinedAt: number | Date;
    status: 'active' | 'invited';
}
