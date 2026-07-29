import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStaff } from '../../state';
import { Loading, Logo, Pill, cx } from '../../ui';

const TABS = [
  { to: '/staff', label: 'Live', end: true },
  { to: '/staff/fleet', label: 'Fleet' },
  { to: '/staff/leads', label: 'Leads' },
  { to: '/staff/insights', label: 'Insights' },
];

export default function StaffShell() {
  const navigate = useNavigate();
  const { staff, loading, signOut } = useStaff();

  useEffect(() => {
    if (!loading && !staff) navigate('/staff/login', { replace: true });
  }, [loading, staff, navigate]);

  if (loading || !staff) return <Loading />;

  return (
    <div className="min-h-full bg-ink-100">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <Logo />
          <Pill tone="brand">{staff.role.replace('_', ' ')}</Pill>
          <span className="hidden text-sm text-ink-500 sm:inline">
            {staff.name}
            {staff.store ? ` · ${staff.store.name}` : ' · all stores'}
          </span>
          <button
            onClick={() => {
              signOut();
              navigate('/staff/login');
            }}
            className="ml-auto text-sm font-semibold text-ink-400 hover:text-ink-900"
          >
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cx(
                  'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-500 hover:text-ink-900',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}
