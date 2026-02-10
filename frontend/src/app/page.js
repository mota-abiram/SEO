'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';

export default function HomePage() {
    const router = useRouter();

    useEffect(() => {
        router.push('/dashboard');
    }, [router]);

    return (
        <div className="page" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{ textAlign: 'center' }}>
                <div className="spinner" style={{
                    width: '40px',
                    height: '40px',
                    borderWidth: '4px',
                    margin: '0 auto'
                }}></div>
                <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
                    Redirecting...
                </p>
            </div>
        </div>
    );
}
