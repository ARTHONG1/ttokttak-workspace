#!/bin/sh
# deb/rpm post-install: expose the ttokttak command line shipped inside the app.
# Only an absent name, a dead link or a link into our own install dir is taken
# over; anything else at /usr/bin/ttokttak belongs to another program (genoffice#893).
set -e
launcher="/opt/HangulAIWorkbench/resources/cli/ttokttak"
link="/usr/bin/ttokttak"
[ -x "$launcher" ] || exit 0
if [ -L "$link" ]; then
  case "$(readlink "$link")" in
    /opt/HangulAIWorkbench/*) ;;
    *) [ -e "$link" ] && { echo "ttokttak: $link is another program, left as is; run: ln -s $launcher $link" >&2; exit 0; } ;;
  esac
elif [ -e "$link" ]; then
  echo "ttokttak: $link is another program, left as is; run: ln -s $launcher $link" >&2
  exit 0
fi
ln -sfn "$launcher" "$link"
exit 0
