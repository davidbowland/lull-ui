const React = require('react')

const motion = new Proxy(
  {},
  {
    get: (_, key) => {
      const Component = ({
        children,
        animate,
        initial,
        exit,
        transition,
        layout,
        whileHover,
        whileTap,
        variants,
        ...domProps
      }) => React.createElement(key, domProps, children)
      Component.displayName = `motion.${String(key)}`
      return Component
    },
  },
)

const AnimatePresence = ({ children }) => React.createElement(React.Fragment, null, children)
AnimatePresence.displayName = 'AnimatePresence'

module.exports = { AnimatePresence, motion }
