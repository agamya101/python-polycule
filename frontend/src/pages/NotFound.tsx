import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export const NotFound: React.FC = () => {
  return (
    <div className="py-16 max-w-xl mx-auto">
      <EmptyState
        icon={<Compass className="h-8 w-8" />}
        title="404 — Field Boundary Not Found"
        hint="The route you requested lies outside our monitored agricultural districts. Return to the mission overview to continue."
        action={
          <Link to="/overview">
            <Button variant="primary" size="md">
              <ArrowLeft className="h-4 w-4" />
              Return to Overview
            </Button>
          </Link>
        }
      />
    </div>
  );
};
