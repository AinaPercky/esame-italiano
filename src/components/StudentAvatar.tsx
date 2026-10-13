import React, { useState } from 'react';
import { UserRound } from 'lucide-react';

interface StudentAvatarProps {
  name: string;
  src?: string;
  className: string;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({ name, src, className }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');

  return (
    <div
      className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-amber-100 text-amber-900 ${className}`}
      role="img"
      aria-label={`Photo de profil de ${name}`}
    >
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : initials ? (
        <span className="font-bold">{initials}</span>
      ) : (
        <UserRound className="w-1/2 h-1/2" />
      )}
    </div>
  );
};
