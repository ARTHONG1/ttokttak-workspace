// Browser test only: the native messaging host as Chrome starts it, run on this Node.
import { runEdufineHost } from '../../../cli/src/edufine-host'

void runEdufineHost(process.stdin, process.stdout).then(() => process.exit(0))
