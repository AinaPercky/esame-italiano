function capitalizeNamePart(part: string): string {
  const [firstCharacter, ...remainingCharacters] = Array.from(part.toLocaleLowerCase('fr-FR'));
  return firstCharacter
    ? `${firstCharacter.toLocaleUpperCase('fr-FR')}${remainingCharacters.join('')}`
    : '';
}

export function normalizeFirstName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => word.split(/([-'])/).map(capitalizeNamePart).join(''))
    .join(' ');
}

export function normalizeLastName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
}
