import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Scan from './pages/Scan';
import StoreAvailability from './pages/StoreAvailability';
import Verify from './pages/Verify';
import Profile from './pages/Profile';
import Confirm from './pages/Confirm';
import Session from './pages/Session';
import Wrap from './pages/Wrap';
import History from './pages/History';
import StaffLogin from './pages/staff/Login';
import StaffShell from './pages/staff/Shell';
import Overview from './pages/staff/Overview';
import Fleet from './pages/staff/Fleet';
import Leads from './pages/staff/Leads';
import Insights from './pages/staff/Insights';

export default function App() {
  return (
    <Routes>
      {/* Guest journey — everything from the QR sticker to the follow-up offer. */}
      <Route path="/" element={<Home />} />
      <Route path="/s/:qrToken" element={<Scan />} />
      <Route path="/store/:storeId" element={<StoreAvailability />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/confirm" element={<Confirm />} />
      <Route path="/session/:id" element={<Session />} />
      <Route path="/session/:id/wrap" element={<Wrap />} />
      <Route path="/me" element={<History />} />

      {/* Store team console. */}
      <Route path="/staff/login" element={<StaffLogin />} />
      <Route path="/staff" element={<StaffShell />}>
        <Route index element={<Overview />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="leads" element={<Leads />} />
        <Route path="insights" element={<Insights />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
