import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function MessengerBotSettings() {
  return (
    <Card className="bg-card border-indigo-700/40">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <span role="img" aria-label="Messenger">🔵</span> Messenger Bot Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-2">Configure your Facebook Messenger bot integration here. (Coming soon)</p>
        {/* Add Messenger bot configuration form fields here */}
      </CardContent>
    </Card>
  );
}
