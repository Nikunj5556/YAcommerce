// guest-order-system.ts

// A simple guest order system with phone verification

class GuestOrderSystem {
    constructor() {
        this.orders = [];
    }

    // Method to create a new guest order
    createOrder(orderDetails) {
        const orderId = this.generateOrderId();
        const order = { id: orderId, ...orderDetails };
        this.orders.push(order);
        return order;
    }

    // Method to verify phone number
    verifyPhoneNumber(phoneNumber) {
        const verificationCode = this.sendVerificationCode(phoneNumber);
        return verificationCode;
    }

    // Simulates sending a verification code to the user's phone
    sendVerificationCode(phoneNumber) {
        const code = Math.floor(100000 + Math.random() * 900000); // generates a random 6-digit code
        console.log(`Verification code sent to ${phoneNumber}: ${code}`);
        return code;
    }

    // Generate a unique order ID
    generateOrderId() {
        return `ORD-${new Date().getTime()}`;
    }
}

// Example usage
const guestOrderSystem = new GuestOrderSystem();
const phoneNumber = '123-456-7890';
const verificationCode = guestOrderSystem.verifyPhoneNumber(phoneNumber);
const order = guestOrderSystem.createOrder({ item: 'Laptop', quantity: 1, phoneVerified: verificationCode });
console.log(order);