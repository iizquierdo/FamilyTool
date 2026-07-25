import { useEffect, useState, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAuth } from '../auth';
import { familyApi, type FamilyGoal, type GoalStats } from '../family';
import { Card, Spinner, EmptyState } from '../ui';

const COLORS = ['#818cf8', '#facc15', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#a78bfa'];

export default function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<FamilyGoal[]>([]);
  const [stats, setStats] = useState<Record<string, GoalStats>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const list = await familyApi.goals(user.companyId, 'Active');
    setGoals(list);
    const s = await Promise.all(list.map((g) => familyApi.goalStats(g.id)));
    const map: Record<string, GoalStats> = {};
    list.forEach((g, i) => (map[g.id] = s[i]));
    setStats(map);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Metas familiares</h1>
        <p className="text-xs text-slate-400">Entre todos las alcanzamos. Cada responsabilidad suma. 💪</p>
      </div>

      {goals.length === 0 ? (
        <EmptyState text="Todavía no hay metas activas." />
      ) : (
        goals.map((g) => {
          const st = stats[g.id];
          const pct = st ? Math.round(st.progress * 100) : 0;
          const data = st?.contributors.filter((c) => c.xp > 0) || [];
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-800">{g.title}</h2>
                  {g.description && <p className="text-xs text-slate-400">{g.description}</p>}
                </div>
                <span className="text-2xl">🎯</span>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>{g.currentXp} / {g.targetXp} XP</span>
                  <span className="font-semibold text-blue-500">{pct}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-amber-300" style={{ width: `${pct}%` }} />
                </div>
                {g.targetXp > 0 && g.currentXp < g.targetXp && (
                  <p className="mt-1 text-[11px] text-slate-400">Faltan {g.targetXp - g.currentXp} XP. ¡Vamos juntos!</p>
                )}
              </div>

              {data.length > 0 && (
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-28 w-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data}
                          dataKey="xp"
                          nameKey="userName"
                          innerRadius={28}
                          outerRadius={52}
                          paddingAngle={data.length > 1 ? 2 : 0}
                          isAnimationActive={false}
                          stroke="none"
                        >
                          {data.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1">
                    {data.map((c, i) => (
                      <div key={c.userId} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-slate-600">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          {c.userName}
                          {c.userId === user?.id && <span className="text-[10px] text-blue-500">(vos)</span>}
                        </span>
                        <span className="text-slate-400">{c.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
