import React from 'react';
import Layout from '@/components/Layout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BotSettings from './BotSettings';

const WhatsAppBotSettings = React.lazy(() => import('./WhatsAppBotSettings'));
const MessengerBotSettings = React.lazy(() => import('./MessengerBotSettings'));

export default function BotConfigPage() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-6">Bot Configuration</h1>
        <Tabs defaultValue="telegram" className="space-y-6 mt-0">
          <TabsList className="bg-muted/60 border border-border p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="telegram" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">Telegram Bot</TabsTrigger>
            <TabsTrigger value="whatsapp" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-muted-foreground gap-1.5">WhatsApp Bot</TabsTrigger>
            <TabsTrigger value="messenger" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground gap-1.5">Messenger Bot</TabsTrigger>
          </TabsList>
          <TabsContent value="telegram" className="space-y-6 mt-0">
            <BotSettings />
          </TabsContent>
          <TabsContent value="whatsapp" className="space-y-6 mt-0">
            <React.Suspense fallback={<div>Loading WhatsApp settings...</div>}>
              <WhatsAppBotSettings />
            </React.Suspense>
          </TabsContent>
          <TabsContent value="messenger" className="space-y-6 mt-0">
            <React.Suspense fallback={<div>Loading Messenger settings...</div>}>
              <MessengerBotSettings />
            </React.Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
