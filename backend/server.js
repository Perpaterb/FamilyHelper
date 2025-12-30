/**
 * Family Helper API Server (Local Development)
 *
 * This Express.js server provides the backend API for local development.
 * In Phase 6, controllers/services will be converted to AWS Lambda functions.
 *
 * Architecture:
 * - Express routes → Controllers → Services → Database (Prisma)
 * - Services are written to be Lambda-compatible (pure functions)
 * - Controllers handle Express request/response (will become Lambda handlers)
 *
 * API Endpoints:
 * - /health - Health check
 * - /auth - Authentication (Kinde)
 * - /subscriptions - Subscription management (Stripe)
 * - /groups - Group management
 * - /logs - Audit log exports
 * - /files - File uploads
 */

// Load environment variables
// - Local development: loads from ../.env.local
// - Lightsail production: loads from .env (same directory)
// - Lambda: uses Lambda environment variables (no dotenv needed)
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const dotenv = require('dotenv');
  // Try .env in current directory first (Lightsail), then ../.env.local (local dev)
  const result = dotenv.config();
  if (result.error) {
    dotenv.config({ path: '../.env.local' });
  }
}
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

// Import configuration
const { validateKindeConfig } = require('./config/auth');
const { validateStripeConfig } = require('./config/stripe');
const { emailService } = require('./services/email');
const mediaProcessor = require('./services/mediaProcessor.service');
const { initSyncJob } = require('./jobs/syncImportedCalendars');
const { initCalendarReminderJob } = require('./jobs/calendarNotificationReminders');

// Import routes
const healthRoutes = require('./routes/health.routes');
const filesRoutes = require('./routes/files.routes');
const authRoutes = require('./routes/auth.routes');
const subscriptionRoutes = require('./routes/subscriptions.routes');
const usersRoutes = require('./routes/users.routes');
const groupsRoutes = require('./routes/groups.routes');
const invitationsRoutes = require('./routes/invitations.routes');
const logsRoutes = require('./routes/logs.routes');
const personalRegistriesRoutes = require('./routes/personalRegistries.routes');
const secretSantaRoutes = require('./routes/secretSanta.routes');
const publicRegistriesRoutes = require('./routes/publicRegistries.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const storageRoutes = require('./routes/storage.routes');
const supportRoutes = require('./routes/support.routes');
const mediaProcessingRoutes = require('./routes/mediaProcessing.routes');
const recordingQueueRoutes = require('./routes/recordingQueue.routes');
const notificationsRoutes = require('./routes/notifications.routes');

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type']
}));
app.use(cookieParser());

// Stripe webhook needs raw body for signature verification
// Must be BEFORE express.json() which consumes the body
app.use('/subscriptions/webhook', express.raw({ type: 'application/json' }));

// JSON parser for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (for recorder.html used by Puppeteer)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Request logging disabled - uncomment to enable verbose request logging
// if (process.env.NODE_ENV !== 'production') {
//   app.use((req, res, next) => {
//     console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
//     next();
//   });
// }

// Routes
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/files', filesRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/users', usersRoutes);
app.use('/users/personal-registries', personalRegistriesRoutes);
app.use('/groups', groupsRoutes);
app.use('/invitations', invitationsRoutes);
app.use('/logs', logsRoutes);
app.use('/secret-santa', secretSantaRoutes);
app.use('/public', publicRegistriesRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/storage', storageRoutes);
app.use('/support', supportRoutes);
app.use('/media', mediaProcessingRoutes);
app.use('/recording-queue', recordingQueueRoutes);
app.use('/notifications', notificationsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
});

// Only start server if not running in test mode
if (process.env.NODE_ENV !== 'test') {
  // Start server
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Family Helper API Server');
    console.log('================================');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Health Check: http://localhost:${PORT}/health`);
    console.log('');
    console.log('Services:');
    console.log(`- PostgreSQL: localhost:5432`);
    console.log(`- MailHog UI: http://localhost:8025`);
    console.log('');

    // Validate Kinde configuration
    validateKindeConfig();

    // Verify email service connection
    emailService.verifyConnection();

    // Check media processor Docker container
    mediaProcessor.checkAndLogStatus();

    // Initialize background jobs
    initSyncJob();
    initCalendarReminderJob();

    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('================================');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

module.exports = app; // For testing
