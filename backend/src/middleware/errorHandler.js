/**
 * Global Error Handler Middleware
 * Catches and formats errors for consistent API responses
 */

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
    // Log error for debugging
    console.error('Error:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method
    });

    // Default error status and message
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    // Send error response
    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'Route not found',
        path: req.path
    });
}

module.exports = {
    errorHandler,
    notFoundHandler
};
