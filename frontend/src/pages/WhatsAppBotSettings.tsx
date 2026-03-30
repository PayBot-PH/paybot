import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function WhatsAppBotSettings() {
  return (
    <Card className="bg-card border-green-700/40">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <span role="img" aria-label="WhatsApp">🟢</span> WhatsApp Bot Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-2">Configure your WhatsApp bot integration here. (Coming soon)</p>
        {/* Add WhatsApp bot configuration form fields here */}
      </CardContent>
    </Card>
  );
}
