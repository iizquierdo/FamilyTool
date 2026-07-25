export function initials(name?: string, email?: string) {
  const base = (name || email || '?').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export default function Avatar({
  name,
  email,
  avatar,
  size = 36
}: {
  name?: string;
  email?: string;
  avatar?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (avatar) {
    return <img src={avatar} alt={name || 'avatar'} className="rounded-full object-cover" style={style} />;
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-indigo-500 font-bold text-white"
      style={{ ...style, fontSize: size * 0.4 }}
    >
      {initials(name, email)}
    </div>
  );
}
