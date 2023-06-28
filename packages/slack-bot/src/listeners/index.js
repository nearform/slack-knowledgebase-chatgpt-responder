import { registerEvents } from './events.js'
import { registerCommands } from './commands.js'
import { registerRoutes } from './routes.js'

export const registerListeners = (app, receiver) => {
  registerCommands(app)
  registerRoutes(receiver, app)
  registerEvents(app)
}
