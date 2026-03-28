router.post('/rentals', async (req, res) => {
    try {
        const { rentalStartDate, rentalEndDate, deliveryAddress } = req.body;

        // 1. CATCH THE ARRAYS FROM YOUR EJS
        // We use [].concat to handle cases with only 1 item
        const itemNames = [].concat(req.body['itemType[]'] || []);
        const quantities = [].concat(req.body['quantity[]'] || []);
        const prices = [].concat(req.body['pricePerDay[]'] || []);

        // 2. CHECK IF EMPTY
        if (itemNames.length === 0) {
            req.flash('error', 'Please select at least one item.');
            return res.redirect('/user/rentals/new');
        }

        const start = new Date(rentalStartDate);
        const end = new Date(rentalEndDate);
        const numberOfDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

        // 3. COMBINE THEM INTO OBJECTS FOR THE DATABASE
        const rentalItems = itemNames.map((name, i) => ({
            item: name, 
            quantity: parseInt(quantities[i]),
            pricePerDay: parseFloat(prices[i]),
            subtotal: parseInt(quantities[i]) * parseFloat(prices[i]) * numberOfDays
        }));

        const rental = new Rental({
            customer: req.currentUser._id,
            items: rentalItems,
            rentalStartDate: start,
            rentalEndDate: end,
            numberOfDays,
            deliveryAddress,
            totalCost: rentalItems.reduce((acc, curr) => acc + curr.subtotal, 0),
            status: 'pending'
        });

        await rental.save();
        req.flash('success', 'Rental submitted!');
        
        // Redirect to the list or detail page
        res.redirect('/user/rentals'); 

    } catch (err) {
        console.error("ERROR:", err);
        req.flash('error', err.message);
        res.redirect('/user/rentals/new');
    }
});