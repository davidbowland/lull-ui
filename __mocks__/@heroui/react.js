const React = require('react')

const passThrough = ({ children, className, ...props }) => React.createElement('div', { className, ...props }, children)

const Accordion = passThrough
const AccordionItem = passThrough
const AccordionHeading = passThrough
const AccordionTrigger = passThrough
const AccordionPanel = passThrough
const AccordionBody = passThrough
const AccordionIndicator = passThrough

const AlertRoot = ({ children, status, className, ...props }) =>
  React.createElement('div', { className, 'data-status': status, role: 'alert', ...props }, children)
const AlertIndicator = passThrough
const AlertContent = passThrough
const AlertTitle = ({ children, ...props }) => React.createElement('p', props, children)
const AlertDescription = ({ children, ...props }) => React.createElement('span', props, children)

const Button = ({ children, onPress, isIconOnly, isDisabled, variant, type, ...props }) =>
  React.createElement('button', { disabled: isDisabled, onClick: onPress, type, ...props }, children)

const Card = passThrough
const CardContent = passThrough
const CardHeader = passThrough
const CardFooter = passThrough
const CardRoot = ({ children, className, variant, ...props }) =>
  React.createElement('div', { className, ...props }, children)
const CardTitle = ({ children, ...props }) => React.createElement('h3', props, children)

const Chip = ({ children, ...props }) => React.createElement('span', props, children)
const ChipRoot = ({ children, color, variant, size, className, ...props }) =>
  React.createElement('div', { className, ...props }, children)
const ChipLabel = ({ children, ...props }) => React.createElement('span', props, children)

const Input = ({
  label,
  'aria-label': ariaLabel,
  onChange,
  value,
  type,
  isDisabled,
  disabled,
  isRequired,
  required,
  autoComplete,
  className,
  ...props
}) =>
  React.createElement('input', {
    'aria-label': ariaLabel || label,
    autoComplete,
    className,
    disabled: disabled || isDisabled,
    onChange: (e) => onChange && onChange(e),
    required: required || isRequired,
    type: type || 'text',
    value,
  })

const Select = ({ children, label, onSelectionChange, selectedKeys, className, ...props }) =>
  React.createElement(
    'select',
    {
      'aria-label': label,
      className,
      onChange: (e) => onSelectionChange && onSelectionChange(new Set([e.target.value])),
      value: selectedKeys ? Array.from(selectedKeys)[0] : '',
    },
    children,
  )

const SelectItem = ({ children, value, ...props }) => React.createElement('option', { value }, children)

const Separator = () => React.createElement('hr')

const Skeleton = ({ className, ...props }) =>
  React.createElement('div', { className, 'data-slot': 'skeleton', ...props })

const Spinner = ({ size, className, ...props }) =>
  React.createElement('div', { className, 'data-slot': 'spinner', ...props })

module.exports = {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionIndicator,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  AlertContent,
  AlertDescription,
  AlertIndicator,
  AlertRoot,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardRoot,
  CardTitle,
  Chip,
  ChipLabel,
  ChipRoot,
  Input,
  Select,
  SelectItem,
  Separator,
  Skeleton,
  Spinner,
}
