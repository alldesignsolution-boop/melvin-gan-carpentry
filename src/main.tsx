import React from 'react';
import {createRoot} from 'react-dom/client';
import HQ from '../components/hq';
import '../app/hq.css';
import '../app/crm.css';
import '../app/ads.css';
createRoot(document.getElementById('root')!).render(<HQ displayName="Melvin Gan"/>);
