'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthContextRefactored';
import { Organization, OrgMember } from '@/types/org';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, addDoc, updateDoc, setDoc } from 'firebase/firestore';

interface OrganizationContextType {
  organizations: Organization[];
  currentOrg: Organization | null;
  userRole: 'owner' | 'admin' | 'editor' | 'viewer' | null;
  isLoading: boolean;
  
  createOrganization: (name: string) => Promise<void>;
  switchOrganization: (orgId: string) => void;
  updateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
  inviteMember: (email: string, role: OrgMember['role']) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<OrgMember['role'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load User's Organizations
  useEffect(() => {
    async function loadOrgs() {
      if (!user) {
        setOrganizations([]);
        setCurrentOrg(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // 1. Find memberships
        const membersRef = collection(db, 'org_members');
        const q = query(membersRef, where('userId', '==', user.id));
        const snapshot = await getDocs(q);
        
        const orgIds = snapshot.docs.map(d => d.data().orgId);
        
        if (orgIds.length > 0) {
            // 2. Fetch Org Details (Firestore "in" query handles up to 10)
            const orgsRef = collection(db, 'organizations');
            // Chunking might be needed for > 10, keeping it simple for now
            const orgsQ = query(orgsRef, where('id', 'in', orgIds.slice(0, 10))); 
            const orgsSnap = await getDocs(orgsQ);
            
            const loadedOrgs = orgsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Organization));
            setOrganizations(loadedOrgs);
            
            // Set default/first
            if (loadedOrgs.length > 0) {
                const savedOrgId = localStorage.getItem('amble_last_org_id');
                const target = loadedOrgs.find(o => o.id === savedOrgId) || loadedOrgs[0];
                setCurrentOrg(target);
            }
        } else {
            // No orgs? Create a default "Personal" org?
            // Or just leave empty
            setOrganizations([]);
        }
      } catch (e) {
        console.error("Failed to load organizations", e);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadOrgs();
  }, [user]);

  // Determine Role in Current Org
  useEffect(() => {
    async function checkRole() {
        if (!user || !currentOrg) {
            setUserRole(null);
            return;
        }
        
        // Optimistic check: owner
        if (currentOrg.ownerId === user.id) {
            setUserRole('owner');
            return;
        }

        // Check member record
        // In a real app, we'd probably cache this in the `organizations` list or state
        try {
             // simplified: assume we fetched it or fetch now
             const q = query(
                 collection(db, 'org_members'), 
                 where('userId', '==', user.id),
                 where('orgId', '==', currentOrg.id)
             );
             const snap = await getDocs(q);
             if (!snap.empty) {
                 setUserRole(snap.docs[0].data().role);
             }
        } catch (e) { console.error(e) }
    }
    checkRole();
  }, [user, currentOrg]);

  const switchOrganization = (orgId: string) => {
      const target = organizations.find(o => o.id === orgId);
      if (target) {
          setCurrentOrg(target);
          localStorage.setItem('amble_last_org_id', orgId);
      }
  };

  const createOrganization = async (name: string) => {
      if (!user) return;
      
      const newOrgRef = doc(collection(db, 'organizations'));
      const newOrg: Organization = {
          id: newOrgRef.id,
          name: name,
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          ownerId: user.id,
          createdAt: Date.now(),
          settings: { maxSeats: 5 }
      };
      
      await setDoc(newOrgRef, newOrg);
      
      // Add member record
      await addDoc(collection(db, 'org_members'), {
          orgId: newOrgRef.id,
          userId: user.id,
          role: 'owner',
          joinedAt: Date.now(),
          status: 'active'
      });
      
      setOrganizations(prev => [...prev, newOrg]);
      switchOrganization(newOrg.id);
  };
  
  const updateOrganization = async (orgId: string, data: Partial<Organization>) => {
      if (!currentOrg || currentOrg.id !== orgId) return;
      // Permission check?
      
      await updateDoc(doc(db, 'organizations', orgId), data);
      setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, ...data } : o));
      setCurrentOrg(prev => prev ? { ...prev, ...data } : null);
  };

  const inviteMember = async (email: string, role: OrgMember['role']) => {
      // Placeholder: in real app, creates an invite token/email
      console.log(`Inviting ${email} as ${role} to ${currentOrg?.name}`);
  };

  return (
    <OrganizationContext.Provider value={{
      organizations,
      currentOrg,
      userRole,
      isLoading,
      createOrganization,
      switchOrganization,
      updateOrganization,
      inviteMember
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};
