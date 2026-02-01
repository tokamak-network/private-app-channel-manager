import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Send from '@/pages/Send';
import Activity from '@/pages/Activity';
import Settings from '@/pages/Settings';
import Deposit from '@/pages/Deposit';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/send" element={<Send />} />
        <Route path="/deposit" element={<Deposit />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
