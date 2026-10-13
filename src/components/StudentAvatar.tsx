import React, { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';

interface StudentAvatarProps {
  name: string;
  src?: string;
  className: string;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({ name, src, className }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <div
      className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-amber-100 text-amber-900 ${className}`}
      role="img"
      aria-label={`Photo de profil de ${name}`}
    >
      {src && !imageFailed ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : initials ? (
        <span className="font-bold">{initials}</span>
      ) : (
        <UserRound className="w-1/2 h-1/2" />
      )}
    </div>
  );
};
