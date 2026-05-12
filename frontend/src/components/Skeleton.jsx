import { motion } from 'framer-motion';

const Skeleton = ({ className = '' }) => (
  <motion.div
    aria-hidden="true"
    className={`skeleton ${className}`}
    animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
  />
);

export default Skeleton;
