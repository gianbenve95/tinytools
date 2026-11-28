const B = 'Bash';
export const cases = [
  ['mac rm HOME', B, 'rm -rf /Users/utente', 'deny'],
  ['mac rm HOME case-folded', B, 'rm -rf /Users/UTENTE', 'deny'],
  ['mac rm /users/utente lowercase', B, 'rm -rf /users/utente', 'deny'],
  ['mac rm /system/library lower', B, 'rm -rf /system/Library', 'deny'],
  ['mac rm /LIBRARY', B, 'rm -rf /LIBRARY/Preferences', 'deny'],
  ['mac rm ~utente', B, 'rm -rf ~utente', 'deny'],
  ['mac rm ~/Library', B, 'rm -rf ~/Library', 'deny|ask'],
  ['mac rm /System', B, 'rm -rf /System/Library/Fonts', 'deny'],
  ['mac rm /Applications', B, 'rm -rf /Applications/Safari.app', 'deny'],
  ['mac rm TMPDIR literal', B, 'rm -rf /var/folders/ab/xyz/T/regia', 'allow'],
  ['mac rm private TMPDIR', B, 'rm -rf /private/var/folders/ab/xyz/T/regia', 'allow'],
  ['mac rm $TMPDIR var', B, 'rm -rf "$TMPDIR/regia"', 'allow'],
  ['mac rm /Volumes/Disk', B, 'rm -rf /Volumes/Backup', 'deny'],
  ['mac rm in project', B, 'rm -rf node_modules', 'allow'],
  ['mac find ~ -delete', B, 'find ~/Downloads -name "*.dmg" -delete', 'ask'],
];
