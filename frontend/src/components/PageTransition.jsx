import { motion } from 'framer-motion';

const PageTransition = ({ children, className = '' }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

export default PageTransition;
