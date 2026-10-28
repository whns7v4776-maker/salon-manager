// A Terminal build needs Apple Tap to Pay provisioning and device qualification.
// Ordinary builds remain unchanged until this explicit build flag is supplied.
module.exports = {
 dependencies: {
  '@stripe/stripe-terminal-react-native': process.env.STRIPE_TERMINAL_BUILD === 'true'
   ? {} : {platforms:{ios:null,android:null}},
 },
};
