import React from 'react';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';

interface RefreshManifestButtonProps {
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export default function RefreshManifestButton({
  loading,
  onRefresh
}: RefreshManifestButtonProps) {
  return (
    <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-yellow-200 font-medium">Manifest Expired</h3>
          <p className="text-yellow-300 text-sm mt-1">
            The playback URLs have expired. Click refresh to get new URLs.
          </p>
        </div>
        <Button
          onClick={onRefresh}
          disabled={loading}
          variant="default"
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing...' : 'Refresh Manifest'}
        </Button>
      </div>
    </div>
  );
}
