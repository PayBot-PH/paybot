import services.event_bus
print(dir(services.event_bus))
if hasattr(services.event_bus, 'payment_event_bus'):
    print("Found payment_event_bus")
    obj = services.event_bus.payment_event_bus
    print(f"Type: {type(obj)}")
    print(f"Dir: {dir(obj)}")
else:
    print("Not found")
